import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { mockEmbed, mockCreateServerClient } = vi.hoisted(() => ({
  mockEmbed: vi.fn(),
  mockCreateServerClient: vi.fn(),
}))

vi.mock('@/lib/rag/embeddings', () => ({
  embed: mockEmbed,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: mockCreateServerClient,
}))

import { POST } from '@/app/api/rag/search/route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/rag/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VEC_384 = Array.from({ length: 384 }, () => 0.5)

function makeSupabaseMock(): SupabaseClient {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'workflow_embeddings') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{
              workflow_id: 'wf-uuid-1',
              content: 'lead qualification workflow for B2B sales',
              embedding: `[${VEC_384.join(',')}]`,
            }],
            error: null,
          }),
        }
      }
      if (table === 'workflows') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'wf-uuid-1', name: 'Lead Qualification' }],
              error: null,
            }),
          }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
    }),
  } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/rag/search', () => {
  it('returns ranked results array with correct shape', async () => {
    mockEmbed.mockResolvedValue(VEC_384)
    mockCreateServerClient.mockReturnValue(makeSupabaseMock())

    const req = makeRequest({ query: 'qualify leads' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      results: { workflowId: string; name: string; content: string; score: number }[]
    }
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results.length).toBeGreaterThan(0)
    const first = body.results[0]
    expect(typeof first.workflowId).toBe('string')
    expect(typeof first.name).toBe('string')
    expect(typeof first.score).toBe('number')
    // Cosine similarity of identical vectors = 1.0
    expect(first.score).toBeCloseTo(1.0, 5)
  })

  it('returns 400 for empty query string', async () => {
    const req = makeRequest({ query: '' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
