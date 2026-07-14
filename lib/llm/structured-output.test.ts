import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

const { mockCallLLM } = vi.hoisted(() => ({ mockCallLLM: vi.fn() }))

vi.mock('@/lib/llm/groq', () => ({
  callLLM: mockCallLLM,
}))

import { callLLMStructured, OutputValidationError } from './structured-output'

const schema = z.object({ score: z.number().int().min(1).max(10), reasoning: z.string().optional() })

function llmResult(text: string) {
  return { text, tokensUsed: 10, toolCalls: [], provider: 'groq' as const }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('callLLMStructured', () => {
  it('returns parsed data on a valid first response — no retry', async () => {
    mockCallLLM.mockResolvedValueOnce(llmResult('{"score": 8, "reasoning": "good"}'))

    const { data } = await callLLMStructured({ prompt: 'x' }, schema)

    expect(data).toEqual({ score: 8, reasoning: 'good' })
    expect(mockCallLLM).toHaveBeenCalledTimes(1)
  })

  it('retries once with a correction prompt when the first response is invalid JSON, then succeeds', async () => {
    mockCallLLM
      .mockResolvedValueOnce(llmResult('not json at all'))
      .mockResolvedValueOnce(llmResult('{"score": 6, "reasoning": "fixed"}'))

    const { data } = await callLLMStructured({ prompt: 'x' }, schema)

    expect(data).toEqual({ score: 6, reasoning: 'fixed' })
    expect(mockCallLLM).toHaveBeenCalledTimes(2)
    // The retry prompt must include the original prompt plus a correction note.
    const secondCallArgs = mockCallLLM.mock.calls[1][0] as { prompt: string }
    expect(secondCallArgs.prompt).toContain('x')
    expect(secondCallArgs.prompt).toContain('failed validation')
  })

  it('retries once when the JSON is well-formed but fails schema validation, then succeeds', async () => {
    mockCallLLM
      .mockResolvedValueOnce(llmResult('{"score": 99, "reasoning": "out of range"}'))
      .mockResolvedValueOnce(llmResult('{"score": 5, "reasoning": "in range"}'))

    const { data } = await callLLMStructured({ prompt: 'x' }, schema)

    expect(data).toEqual({ score: 5, reasoning: 'in range' })
    expect(mockCallLLM).toHaveBeenCalledTimes(2)
  })

  it('throws OutputValidationError with the machine-readable code when both attempts fail', async () => {
    mockCallLLM
      .mockResolvedValueOnce(llmResult('not json'))
      .mockResolvedValueOnce(llmResult('still not json'))

    await expect(callLLMStructured({ prompt: 'x' }, schema)).rejects.toThrow(OutputValidationError)
    expect(mockCallLLM).toHaveBeenCalledTimes(2)

    try {
      mockCallLLM
        .mockReset()
        .mockResolvedValueOnce(llmResult('not json'))
        .mockResolvedValueOnce(llmResult('still not json'))
      await callLLMStructured({ prompt: 'x' }, schema)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(OutputValidationError)
      expect((error as OutputValidationError).code).toBe('OUTPUT_VALIDATION_FAILED')
    }
  })
})
