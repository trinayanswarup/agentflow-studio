import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { queryWorkflowLogs } from '@/lib/mcp/server'

// ── Helpers ────────────────────────────────────────────────────────────────────

const WORKFLOW_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'

/** Shared run fixture — created_at determines newest-first ordering. */
function makeRun(overrides: Partial<{
  id: string
  status: string
  created_at: string
  completed_at: string | null
}> = {}) {
  return {
    id: 'run-uuid-001',
    status: 'completed',
    created_at: '2024-01-01T10:00:00Z',
    completed_at: '2024-01-01T10:00:05Z',
    ...overrides,
  }
}

function makeStep(overrides: Partial<{
  run_id: string
  node_id: string
  node_label: string
  status: string
  output: string | null
  error: string | null
  latency_ms: number | null
}> = {}) {
  return {
    run_id: 'run-uuid-001',
    node_id: 'node-abc',
    node_label: 'Web Search',
    status: 'done',
    output: 'some output',
    error: null,
    latency_ms: 123,
    ...overrides,
  }
}

/**
 * Builds a minimal Supabase client mock that satisfies the chained builder
 * pattern used by queryWorkflowLogs:
 *   .from('runs').select(...).eq(...).order(...).limit(...)
 *   .from('run_steps').select(...).in(...).order(...)
 */
function makeSupabaseMock(options: {
  runs: ReturnType<typeof makeRun>[]
  steps: ReturnType<typeof makeStep>[]
  runsError?: { message: string } | null
  stepsError?: { message: string } | null
}): SupabaseClient {
  const runsBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: options.runs,
      error: options.runsError ?? null,
    }),
  }

  const stepsBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: options.steps,
      error: options.stepsError ?? null,
    }),
  }

  return {
    from: vi.fn().mockImplementation((table: string) =>
      table === 'runs' ? runsBuilder : stepsBuilder
    ),
  } as unknown as SupabaseClient
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('queryWorkflowLogs', () => {
  it('returns runs with nested steps for a workflow with run history', async () => {
    const run = makeRun()
    const step = makeStep({ run_id: run.id })
    const supabase = makeSupabaseMock({ runs: [run], steps: [step] })

    const result = await queryWorkflowLogs(supabase, WORKFLOW_ID)

    expect(result).toHaveLength(1)
    expect(result[0].run_id).toBe(run.id)
    expect(result[0].status).toBe('completed')
    expect(result[0].started_at).toBe(run.created_at)
    expect(result[0].completed_at).toBe(run.completed_at)

    expect(result[0].steps).toHaveLength(1)
    expect(result[0].steps[0].node_id).toBe(step.node_id)
    expect(result[0].steps[0].node_label).toBe(step.node_label)
    expect(result[0].steps[0].status).toBe('done')
    expect(result[0].steps[0].latency_ms).toBe(123)
    expect(result[0].steps[0].error).toBeNull()
  })

  it('returns an empty array for a workflow with no runs', async () => {
    const supabase = makeSupabaseMock({ runs: [], steps: [] })

    const result = await queryWorkflowLogs(supabase, WORKFLOW_ID)

    expect(result).toEqual([])
  })

  it('truncates input/output previews to 200 chars', async () => {
    const longOutput = 'x'.repeat(500)
    const run = makeRun()
    const step = makeStep({ run_id: run.id, output: longOutput })
    const supabase = makeSupabaseMock({ runs: [run], steps: [step] })

    const result = await queryWorkflowLogs(supabase, WORKFLOW_ID)

    expect(result[0].steps[0].output_preview).toHaveLength(200)
    expect(result[0].steps[0].output_preview).toBe('x'.repeat(200))
  })

  it('caps results at the last 10 runs', async () => {
    // Verify the supabase query is called with .limit(10) by checking
    // that the mock's limit function is invoked. The actual cap enforcement
    // is delegated to Supabase — the function passes limit(10) and trusts
    // the DB to honour it. We verify the .limit() call was made.
    const runs = Array.from({ length: 3 }, (_, i) =>
      makeRun({ id: `run-${i}`, created_at: `2024-01-0${i + 1}T00:00:00Z` })
    )
    const steps = runs.map((r) => makeStep({ run_id: r.id }))

    const runsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: runs, error: null }),
    }
    const stepsBuilder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: steps, error: null }),
    }
    const supabase = {
      from: vi.fn().mockImplementation((table: string) =>
        table === 'runs' ? runsBuilder : stepsBuilder
      ),
    } as unknown as SupabaseClient

    await queryWorkflowLogs(supabase, WORKFLOW_ID)

    // Confirm that .limit(10) was called on the runs query.
    expect(runsBuilder.limit).toHaveBeenCalledWith(10)
  })

  it('does not call run_steps query when there are no runs', async () => {
    const stepsBuilder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const runsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const supabase = {
      from: vi.fn().mockImplementation((table: string) =>
        table === 'runs' ? runsBuilder : stepsBuilder
      ),
    } as unknown as SupabaseClient

    await queryWorkflowLogs(supabase, WORKFLOW_ID)

    // run_steps should not be queried if there are no runs.
    expect(stepsBuilder.in).not.toHaveBeenCalled()
  })

  it('sets input_preview to null (no input column in run_steps)', async () => {
    const run = makeRun()
    const step = makeStep({ run_id: run.id })
    const supabase = makeSupabaseMock({ runs: [run], steps: [step] })

    const result = await queryWorkflowLogs(supabase, WORKFLOW_ID)

    expect(result[0].steps[0].input_preview).toBeNull()
  })

  it('surfaces the step error field when present', async () => {
    const run = makeRun({ status: 'failed' })
    const step = makeStep({ run_id: run.id, status: 'error', output: null, error: 'Tool timed out' })
    const supabase = makeSupabaseMock({ runs: [run], steps: [step] })

    const result = await queryWorkflowLogs(supabase, WORKFLOW_ID)

    expect(result[0].steps[0].error).toBe('Tool timed out')
    expect(result[0].steps[0].output_preview).toBeNull()
  })

  it('throws when the runs query returns an error', async () => {
    const supabase = makeSupabaseMock({
      runs: [],
      steps: [],
      runsError: { message: 'connection refused' },
    })

    await expect(queryWorkflowLogs(supabase, WORKFLOW_ID)).rejects.toThrow(
      'Failed to fetch runs'
    )
  })

  it('orders runs newest-first (preserves DB ordering)', async () => {
    // The mock returns runs in the order the DB would (newest first, as the
    // query specifies). We verify the result preserves that order.
    const runs = [
      makeRun({ id: 'run-newest', created_at: '2024-03-01T00:00:00Z' }),
      makeRun({ id: 'run-middle', created_at: '2024-02-01T00:00:00Z' }),
      makeRun({ id: 'run-oldest', created_at: '2024-01-01T00:00:00Z' }),
    ]
    const steps = runs.map((r) => makeStep({ run_id: r.id }))
    const supabase = makeSupabaseMock({ runs, steps })

    const result = await queryWorkflowLogs(supabase, WORKFLOW_ID)

    expect(result[0].run_id).toBe('run-newest')
    expect(result[2].run_id).toBe('run-oldest')
  })
})
