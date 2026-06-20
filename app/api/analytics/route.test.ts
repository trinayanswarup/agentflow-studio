import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { mockCreateServerClient } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: mockCreateServerClient,
}))

import { GET } from '@/app/api/analytics/route'

// Returns different data per table — mirrors the four parallel queries in the handler.
function makeSupabaseMock(): SupabaseClient {
  return {
    from: vi.fn().mockImplementation((table: string) => ({
      select: vi.fn().mockResolvedValue(
        table === 'workflows'
          ? { data: [{ id: 'wf-1', name: 'Test Workflow' }], error: null }
          : table === 'runs'
          ? { data: [{ workflow_id: 'wf-1' }], error: null }
          : table === 'workflow_runs'
          ? {
              data: [{
                workflow_id: 'wf-1',
                started_at: '2025-01-01T00:00:00Z',
                completed_at: '2025-01-01T00:01:00Z',
              }],
              error: null,
            }
          : table === 'run_steps'
          ? { data: [{ node_label: 'Web Search', status: 'done' }], error: null }
          : { data: [], error: null }
      ),
    })),
  } as unknown as SupabaseClient
}

function makeEmptySupabaseMock(): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/analytics', () => {
  it('returns workflowStats and stepFailures arrays with data', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseMock())

    const res = await GET()

    expect(res.status).toBe(200)
    const body = (await res.json()) as { workflowStats: unknown[]; stepFailures: unknown[] }
    expect(Array.isArray(body.workflowStats)).toBe(true)
    expect(Array.isArray(body.stepFailures)).toBe(true)
    expect(body.workflowStats.length).toBeGreaterThan(0)
    const stat = body.workflowStats[0] as { name: string; runCount: number }
    expect(typeof stat.name).toBe('string')
    expect(typeof stat.runCount).toBe('number')
  })

  it('handles empty runs gracefully', async () => {
    mockCreateServerClient.mockReturnValue(makeEmptySupabaseMock())

    const res = await GET()

    expect(res.status).toBe(200)
    const body = (await res.json()) as { workflowStats: unknown[]; stepFailures: unknown[] }
    expect(body.workflowStats).toHaveLength(0)
    expect(body.stepFailures).toHaveLength(0)
  })
})
