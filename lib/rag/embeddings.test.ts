import { describe, it, expect, vi, afterEach } from 'vitest'
import { embed } from '@/lib/rag/embeddings'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('embed', () => {
  it('returns array of 384 numbers when HF returns nested array', async () => {
    const vec384 = Array.from({ length: 384 }, (_, i) => i / 1000)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => [vec384],  // HF wraps in outer array
    }))

    const result = await embed('test query')

    expect(result).toHaveLength(384)
    expect(typeof result[0]).toBe('number')
  })

  it('throws on non-array response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => 'unexpected string response',
    }))

    await expect(embed('test')).rejects.toThrow()
  })
})
