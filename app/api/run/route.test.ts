import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { mockCreateServerClient } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: mockCreateServerClient,
}))

import { POST } from '@/app/api/run/route'

const VALID_WORKFLOW_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeSupabaseMock(options: {
  workflowFound: boolean
  runId?: string
}): SupabaseClient {
  const wfError = options.workflowFound ? null : { message: 'Row not found' }
  const runData = options.workflowFound ? { id: options.runId ?? 'run-uuid-abc' } : null

  const workflowBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: VALID_WORKFLOW_ID }, error: wfError }),
  }
  const runBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: runData, error: null }),
  }

  return {
    from: vi.fn().mockImplementation((table: string) =>
      table === 'workflows' ? workflowBuilder : runBuilder
    ),
  } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/run', () => {
  it('with valid workflowId returns 201 and runId', async () => {
    mockCreateServerClient.mockReturnValue(
      makeSupabaseMock({ workflowFound: true, runId: 'run-uuid-123' })
    )
    const req = makeRequest({ workflowId: VALID_WORKFLOW_ID, input: 'test input' })

    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = (await res.json()) as { runId: string }
    expect(typeof body.runId).toBe('string')
    expect(body.runId.length).toBeGreaterThan(0)
  })

  it('with non-existent workflowId returns 404 mentioning not found', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseMock({ workflowFound: false }))
    const req = makeRequest({ workflowId: VALID_WORKFLOW_ID, input: 'test input' })

    const res = await POST(req)

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error.toLowerCase()).toContain('not found')
  })

  it('with malformed UUID returns 400 with Zod error', async () => {
    const req = makeRequest({ workflowId: 'not-a-uuid', input: 'test input' })

    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('with empty input returns 400', async () => {
    const req = makeRequest({ workflowId: VALID_WORKFLOW_ID, input: '' })

    const res = await POST(req)

    expect(res.status).toBe(400)
  })
})
