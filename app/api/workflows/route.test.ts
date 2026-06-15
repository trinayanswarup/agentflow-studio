import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { mockCreateServerClient } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: mockCreateServerClient,
}))

import { GET, POST } from '@/app/api/workflows/route'

const VALID_DEFINITION = {
  name: 'Test Workflow',
  nodes: [{ id: 'input_1', type: 'input', label: 'Input', config: {} }],
  edges: [],
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/workflows', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeSupabaseMock(overrides?: {
  insertResult?: { data: unknown; error: unknown }
  selectResult?: { data: unknown; error: unknown }
}): SupabaseClient {
  const insertResult = overrides?.insertResult ?? {
    data: { id: 'wf-uuid-1', name: 'Test Workflow', created_at: '2025-01-01T00:00:00Z' },
    error: null,
  }
  const selectResult = overrides?.selectResult ?? {
    data: [
      { id: 'wf-uuid-1', name: 'Workflow One', created_at: '2025-01-01T00:00:00Z' },
      { id: 'wf-uuid-2', name: 'Workflow Two', created_at: '2025-01-02T00:00:00Z' },
    ],
    error: null,
  }

  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue(selectResult),
      single: vi.fn().mockResolvedValue(insertResult),
    }),
  } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/workflows', () => {
  it('with valid body returns 201 and workflow object', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseMock())
    const req = makeRequest('POST', { name: 'Test Workflow', definition_json: VALID_DEFINITION })

    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = (await res.json()) as { workflow: { id: string } }
    expect(typeof body.workflow.id).toBe('string')
  })

  it('with empty name returns 400 with Zod error mentioning name', async () => {
    const req = makeRequest('POST', { name: '', definition_json: VALID_DEFINITION })

    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error.toLowerCase()).toContain('name')
  })

  it('with missing definition_json returns 400', async () => {
    const req = makeRequest('POST', { name: 'Test' })

    const res = await POST(req)

    expect(res.status).toBe(400)
  })
})

describe('GET /api/workflows', () => {
  it('returns array of workflows', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseMock())

    const res = await GET()

    expect(res.status).toBe(200)
    const body = (await res.json()) as { workflows: unknown[] }
    expect(Array.isArray(body.workflows)).toBe(true)
    expect(body.workflows).toHaveLength(2)
  })
})
