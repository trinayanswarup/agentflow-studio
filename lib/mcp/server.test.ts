import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getRunDetails,
  getGuardrailEvents,
  detectLikelyCause,
  type RunStepDetail,
} from '@/lib/mcp/server'

// ── Helpers ────────────────────────────────────────────────────────────────────

const RUN_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'

function makeRun(overrides: Partial<{ id: string; status: string; created_at: string; completed_at: string | null }> = {}) {
  return {
    id: RUN_ID,
    status: 'completed',
    created_at: '2024-01-01T10:00:00.000Z',
    completed_at: '2024-01-01T10:00:05.000Z',
    ...overrides,
  }
}

function makeStep(overrides: Partial<{
  node_id: string
  node_label: string
  status: string
  output: string | null
  error: string | null
  error_code: string | null
  latency_ms: number | null
  created_at: string
}> = {}) {
  return {
    node_id: 'node-abc',
    node_label: 'Web Search',
    status: 'done',
    output: 'some output',
    error: null,
    error_code: null,
    latency_ms: 123,
    created_at: '2024-01-01T10:00:01.000Z',
    ...overrides,
  }
}

/**
 * A Supabase query-builder mock that's "thenable" at every chained step
 * (select/eq/order all return itself; awaiting the chain at ANY point
 * resolves), matching the real PostgrestFilterBuilder's behavior. Needed
 * because getRunDetails and getGuardrailEvents call different chain shapes
 * against the same tables (one calls .order(), the other doesn't).
 */
interface ThenableBuilder<T> extends PromiseLike<{ data: T; error: { message: string } | null }> {
  select: (...args: unknown[]) => ThenableBuilder<T>
  eq: (...args: unknown[]) => ThenableBuilder<T>
  order: (...args: unknown[]) => ThenableBuilder<T>
  maybeSingle: () => Promise<{ data: T extends unknown[] ? T[number] | null : T; error: { message: string } | null }>
}

function makeThenableBuilder<T>(data: T, error: { message: string } | null = null): ThenableBuilder<T> {
  const result = { data, error }
  const single = Array.isArray(data) ? (data[0] ?? null) : data
  const builder: ThenableBuilder<T> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve({ data: single as never, error }),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return builder
}

/** Builds a Supabase client mock that dispatches `.from(table)` to per-table thenable builders. */
function makeSupabaseMock(options: {
  runs?: ReturnType<typeof makeRun>[]
  runsError?: { message: string } | null
  steps?: ReturnType<typeof makeStep>[]
  stepsError?: { message: string } | null
  guardrailEvents?: Record<string, unknown>[]
  guardrailError?: { message: string } | null
}): SupabaseClient {
  const runsBuilder = makeThenableBuilder(options.runs ?? [], options.runsError ?? null)
  const stepsBuilder = makeThenableBuilder(options.steps ?? [], options.stepsError ?? null)
  const guardrailBuilder = makeThenableBuilder(options.guardrailEvents ?? [], options.guardrailError ?? null)

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'runs') return runsBuilder
      if (table === 'run_steps') return stepsBuilder
      if (table === 'guardrail_events') return guardrailBuilder
      throw new Error(`Unexpected table in test: ${table}`)
    }),
  } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── getRunDetails ────────────────────────────────────────────────────────────

describe('getRunDetails', () => {
  it('returns overall status, duration, and ordered steps for a run', async () => {
    const run = makeRun()
    const steps = [
      makeStep({ node_id: 'n1', node_label: 'Input', created_at: '2024-01-01T10:00:00.500Z' }),
      makeStep({ node_id: 'n2', node_label: 'Web Search', created_at: '2024-01-01T10:00:01.000Z' }),
    ]
    const supabase = makeSupabaseMock({ runs: [run], steps })

    const result = await getRunDetails(supabase, RUN_ID)

    expect(result.runId).toBe(RUN_ID)
    expect(result.status).toBe('completed')
    expect(result.startedAt).toBe(run.created_at)
    expect(result.completedAt).toBe(run.completed_at)
    expect(result.totalDurationMs).toBe(5000)
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].nodeId).toBe('n1')
    expect(result.steps[1].nodeId).toBe('n2')
  })

  it('throws a descriptive, actionable error when the run does not exist', async () => {
    const supabase = makeSupabaseMock({ runs: [] })

    await expect(getRunDetails(supabase, RUN_ID)).rejects.toThrow(/No run found/)
  })

  it('throws when the runs query errors', async () => {
    const supabase = makeSupabaseMock({ runs: [], runsError: { message: 'connection refused' } })

    await expect(getRunDetails(supabase, RUN_ID)).rejects.toThrow('connection refused')
  })

  it('truncates output previews to 200 chars', async () => {
    const longOutput = 'x'.repeat(500)
    const supabase = makeSupabaseMock({
      runs: [makeRun()],
      steps: [makeStep({ output: longOutput })],
    })

    const result = await getRunDetails(supabase, RUN_ID)

    expect(result.steps[0].outputPreview).toHaveLength(200)
  })

  it('sets failedStep to null and likelyCause to null for a run with no failed step', async () => {
    const supabase = makeSupabaseMock({
      runs: [makeRun()],
      steps: [makeStep({ status: 'done' })],
    })

    const result = await getRunDetails(supabase, RUN_ID)

    expect(result.failedStep).toBeNull()
    expect(result.likelyCause).toBeNull()
  })

  // ── The core requirement: distinguish symptom (failedStep) from cause (likelyCause) ──

  it('distinguishes the failed step (symptom) from the likely cause (upstream step)', async () => {
    const steps = [
      makeStep({
        node_id: 'extract_1',
        node_label: 'Extract Profile',
        status: 'done',
        output: 'not valid json {{{',
        created_at: '2024-01-01T10:00:01.000Z',
      }),
      makeStep({
        node_id: 'condition_1',
        node_label: 'Score Check',
        status: 'error',
        output: null,
        error: 'Cannot read property of undefined',
        created_at: '2024-01-01T10:00:02.000Z',
      }),
    ]
    const supabase = makeSupabaseMock({ runs: [makeRun({ status: 'failed' })], steps })

    const result = await getRunDetails(supabase, RUN_ID)

    // Symptom: the step that actually reported the error.
    expect(result.failedStep).not.toBeNull()
    expect(result.failedStep?.nodeId).toBe('condition_1')
    expect(result.failedStep?.errorMessage).toBe('Cannot read property of undefined')

    // Cause: a separate field pointing at the upstream step's suspicious output.
    expect(result.likelyCause).not.toBeNull()
    expect(result.likelyCause).toContain('Extract Profile')
    expect(result.likelyCause).toContain('not valid JSON')
    // Must not just be the failed step's own error restated.
    expect(result.likelyCause).not.toBe(result.failedStep?.errorMessage)
  })

  it('attributes the cause to the failed step itself when it has its own validation_retry event', async () => {
    const steps = [
      makeStep({ node_id: 'upstream_1', node_label: 'Search', status: 'done', output: 'fine' }),
      makeStep({
        node_id: 'judge_1',
        node_label: 'Quality Score',
        status: 'error',
        output: null,
        error: 'Structured output failed schema validation twice.',
        error_code: 'OUTPUT_VALIDATION_FAILED',
      }),
    ]
    const guardrailEvents = [
      {
        node_id: 'judge_1',
        event_type: 'validation_retry',
        error_message: 'score: Required',
        output_preview: 'not json at all',
      },
    ]
    const supabase = makeSupabaseMock({ runs: [makeRun({ status: 'failed' })], steps, guardrailEvents })

    const result = await getRunDetails(supabase, RUN_ID)

    expect(result.failedStep?.nodeId).toBe('judge_1')
    expect(result.failedStep?.errorCode).toBe('OUTPUT_VALIDATION_FAILED')
    // Cause should point at the step's own bad output, not blame upstream.
    expect(result.likelyCause).toContain('own structured-output validation')
    expect(result.likelyCause).toContain('not json at all')
    expect(result.likelyCause).not.toContain('Search')
  })

  it('reports "no upstream step" as the cause when the first step fails', async () => {
    const steps = [makeStep({ node_id: 'input_1', node_label: 'Input', status: 'error', error: 'boom' })]
    const supabase = makeSupabaseMock({ runs: [makeRun({ status: 'failed' })], steps })

    const result = await getRunDetails(supabase, RUN_ID)

    expect(result.failedStep?.nodeId).toBe('input_1')
    expect(result.likelyCause).toContain('first step')
  })

  it('counts backoff_retry guardrail events per node as retryCount', async () => {
    const steps = [makeStep({ node_id: 'search_1', node_label: 'Web Search', status: 'done' })]
    const guardrailEvents = [
      { node_id: 'search_1', event_type: 'backoff_retry' },
      { node_id: 'search_1', event_type: 'backoff_retry' },
      { node_id: 'search_1', event_type: 'validation_retry' }, // different type — must not count
    ]
    const supabase = makeSupabaseMock({ runs: [makeRun()], steps, guardrailEvents })

    const result = await getRunDetails(supabase, RUN_ID)

    expect(result.steps[0].retryCount).toBe(2)
  })

  it('exposes the exact error code alongside the error message when a step failed', async () => {
    const steps = [
      makeStep({ node_id: 'llm_1', status: 'error', error: 'Step timed out after 30000ms', error_code: 'STEP_TIMEOUT' }),
    ]
    const supabase = makeSupabaseMock({ runs: [makeRun({ status: 'failed' })], steps })

    const result = await getRunDetails(supabase, RUN_ID)

    expect(result.steps[0].errorCode).toBe('STEP_TIMEOUT')
    expect(result.steps[0].errorMessage).toBe('Step timed out after 30000ms')
    expect(result.failedStep?.errorCode).toBe('STEP_TIMEOUT')
  })
})

// ── detectLikelyCause (pure heuristic, tested directly) ─────────────────────

describe('detectLikelyCause', () => {
  const failedStep: RunStepDetail = {
    nodeId: 'b',
    nodeLabel: 'Step B',
    status: 'error',
    inputPreview: null,
    outputPreview: null,
    errorCode: null,
    errorMessage: 'failed',
    retryCount: 0,
    latencyMs: 10,
    startedAt: '2024-01-01T00:00:01.000Z',
    finishedAt: null,
  }

  it('returns null when there is no failed step', () => {
    expect(detectLikelyCause({ failedStep: null, upstreamStep: null, validationEvent: null })).toBeNull()
  })

  it('flags malformed upstream JSON as the likely cause', () => {
    const upstreamStep: RunStepDetail = {
      ...failedStep,
      nodeId: 'a',
      nodeLabel: 'Step A',
      status: 'done',
      outputPreview: '{not valid json',
    }

    const cause = detectLikelyCause({ failedStep, upstreamStep, validationEvent: null })

    expect(cause).toContain('Step A')
    expect(cause).toContain('not valid JSON')
  })

  it('flags an empty upstream output as the likely cause', () => {
    const upstreamStep: RunStepDetail = { ...failedStep, nodeId: 'a', nodeLabel: 'Step A', outputPreview: '' }

    const cause = detectLikelyCause({ failedStep, upstreamStep, validationEvent: null })

    expect(cause).toContain('produced no output')
  })

  it('does not flag valid JSON upstream output as malformed', () => {
    const upstreamStep: RunStepDetail = {
      ...failedStep,
      nodeId: 'a',
      nodeLabel: 'Step A',
      outputPreview: '{"score": 8}',
    }

    const cause = detectLikelyCause({ failedStep, upstreamStep, validationEvent: null })

    expect(cause).not.toContain('not valid JSON')
    expect(cause).toContain('Step A')
  })

  it('cites a recorded STEP_TIMEOUT on the failed step instead of speculating about upstream JSON', () => {
    const timedOutStep: RunStepDetail = {
      ...failedStep,
      errorCode: 'STEP_TIMEOUT',
      errorMessage: 'Step timed out after 1ms',
    }
    // Upstream output looks "suspicious" (not valid JSON) — the recorded
    // timeout must still win over this speculative signal.
    const upstreamStep: RunStepDetail = {
      ...failedStep,
      nodeId: 'a',
      nodeLabel: 'Step A',
      status: 'done',
      outputPreview: 'JPST REAL ESTATE',
    }

    const cause = detectLikelyCause({ failedStep: timedOutStep, upstreamStep, validationEvent: null })

    expect(cause).toContain('Step B')
    expect(cause).toContain('configured step timeout')
    expect(cause).toContain('Step timed out after 1ms')
    expect(cause).not.toContain('Step A')
    expect(cause).not.toContain('not valid JSON')
  })

  it('cites a recorded BUDGET_EXCEEDED on the failed step instead of speculating about upstream JSON', () => {
    const budgetStep: RunStepDetail = {
      ...failedStep,
      errorCode: 'BUDGET_EXCEEDED',
      errorMessage: 'Budget exceeded: $1.5000 > cap $1',
    }
    const upstreamStep: RunStepDetail = {
      ...failedStep,
      nodeId: 'a',
      nodeLabel: 'Step A',
      status: 'done',
      outputPreview: 'not valid json',
    }

    const cause = detectLikelyCause({ failedStep: budgetStep, upstreamStep, validationEvent: null })

    expect(cause).toContain('Step B')
    expect(cause).toContain('cost cap')
    expect(cause).not.toContain('Step A')
    expect(cause).not.toContain('not valid JSON')
  })

  it('still prioritizes a validation_retry event over upstream speculation when there is no timeout/budget code', () => {
    const upstreamStep: RunStepDetail = {
      ...failedStep,
      nodeId: 'a',
      nodeLabel: 'Step A',
      status: 'done',
      outputPreview: 'not valid json',
    }
    const validationEvent = { errorMessage: 'score: Required', outputPreview: 'not json at all' }

    const cause = detectLikelyCause({ failedStep, upstreamStep, validationEvent })

    expect(cause).toContain('Step B')
    expect(cause).toContain('own structured-output validation')
    expect(cause).not.toContain('Step A')
  })
})

// ── getGuardrailEvents ───────────────────────────────────────────────────────

describe('getGuardrailEvents', () => {
  it('returns an empty array for a run with no guardrail events', async () => {
    const supabase = makeSupabaseMock({ guardrailEvents: [] })

    const result = await getGuardrailEvents(supabase, RUN_ID)

    expect(result).toEqual([])
  })

  it('returns full context for a validation_retry event, not just type and timestamp', async () => {
    const guardrailEvents = [
      {
        node_id: 'judge_1',
        node_label: 'Quality Score',
        event_type: 'validation_retry',
        attempt: null,
        http_status: null,
        delay_ms: null,
        timeout_ms: null,
        total_cost_usd: null,
        cap_usd: null,
        error_message: 'score: Required',
        output_preview: 'not json at all',
        created_at: '2024-01-01T10:00:02.000Z',
      },
    ]
    const supabase = makeSupabaseMock({ guardrailEvents, steps: [makeStep({ node_id: 'judge_1', status: 'error' })] })

    const [event] = await getGuardrailEvents(supabase, RUN_ID)

    expect(event.eventType).toBe('validation_retry')
    expect(event.nodeId).toBe('judge_1')
    expect(event.nodeLabel).toBe('Quality Score')
    expect(event.errorMessage).toBe('score: Required')
    expect(event.outputPreview).toBe('not json at all')
  })

  it('returns the HTTP status and retry outcome for a backoff_retry event', async () => {
    const guardrailEvents = [
      {
        node_id: 'search_1',
        node_label: 'Web Search',
        event_type: 'backoff_retry',
        attempt: 1,
        http_status: 429,
        delay_ms: 620,
        timeout_ms: null,
        total_cost_usd: null,
        cap_usd: null,
        error_message: 'Rate limited',
        output_preview: null,
        created_at: '2024-01-01T10:00:01.000Z',
      },
    ]
    // The node ultimately succeeded (status 'done') — the retry paid off.
    const supabase = makeSupabaseMock({
      guardrailEvents,
      steps: [makeStep({ node_id: 'search_1', status: 'done' })],
    })

    const [event] = await getGuardrailEvents(supabase, RUN_ID)

    expect(event.eventType).toBe('backoff_retry')
    expect(event.attempt).toBe(1)
    expect(event.httpStatus).toBe(429)
    expect(event.delayMs).toBe(620)
    expect(event.retrySucceeded).toBe(true)
  })

  it('reports retrySucceeded as false when the node ultimately failed', async () => {
    const guardrailEvents = [
      {
        node_id: 'search_1',
        node_label: 'Web Search',
        event_type: 'backoff_retry',
        attempt: 3,
        http_status: 503,
        delay_ms: 4000,
        timeout_ms: null,
        total_cost_usd: null,
        cap_usd: null,
        error_message: 'Service unavailable',
        output_preview: null,
        created_at: '2024-01-01T10:00:01.000Z',
      },
    ]
    const supabase = makeSupabaseMock({
      guardrailEvents,
      steps: [makeStep({ node_id: 'search_1', status: 'error' })],
    })

    const [event] = await getGuardrailEvents(supabase, RUN_ID)

    expect(event.retrySucceeded).toBe(false)
  })

  it('leaves retrySucceeded null for non-retry event types', async () => {
    const guardrailEvents = [
      {
        node_id: 'llm_1',
        node_label: 'Write Brief',
        event_type: 'budget_exceeded',
        attempt: null,
        http_status: null,
        delay_ms: null,
        timeout_ms: null,
        total_cost_usd: 0.15,
        cap_usd: 0.1,
        error_message: null,
        output_preview: null,
        created_at: '2024-01-01T10:00:01.000Z',
      },
    ]
    const supabase = makeSupabaseMock({ guardrailEvents, steps: [] })

    const [event] = await getGuardrailEvents(supabase, RUN_ID)

    expect(event.eventType).toBe('budget_exceeded')
    expect(event.totalCostUsd).toBe(0.15)
    expect(event.capUsd).toBe(0.1)
    expect(event.retrySucceeded).toBeNull()
  })

  it('throws when the guardrail_events query errors', async () => {
    const supabase = makeSupabaseMock({ guardrailError: { message: 'connection refused' } })

    await expect(getGuardrailEvents(supabase, RUN_ID)).rejects.toThrow('connection refused')
  })
})
