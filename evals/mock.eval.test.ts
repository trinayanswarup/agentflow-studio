/**
 * Mock eval suite — runs every 'mock'-tagged case in evals/cases/ against the
 * real WorkflowRunner with callLLM and the web_search tool replaced by
 * canned, per-case responses. Requires zero API keys.
 *
 * Mocking strategy: only two seams are faked —
 *   1. @/lib/llm/groq's callLLM — the single choke point for every LLM call
 *      (llm_call nodes AND the internal judge calls made by the
 *      evaluate_output/extract_json tools), same vi.mock pattern as
 *      lib/engine/runner.test.ts.
 *   2. The web_search tool's real registry entry is overridden (via the
 *      real, unmocked registerTool()) with a canned-response version — the
 *      real Zod validation, real registry, and real evaluate_output /
 *      extract_json tool logic (including Phase 2's structured-output
 *      retry) all still run for real.
 * web_fetch / send_webhook are untouched since none of the mock-tagged
 * cases exercise them.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

interface QueuedLLMResponse {
  text: string
  tokensUsed?: number
  delayMs?: number
}

const { mockCallLLM, mockState } = vi.hoisted(() => {
  const mockState: {
    llmQueue: QueuedLLMResponse[]
    webSearchQueue: string[]
  } = {
    llmQueue: [],
    webSearchQueue: [],
  }
  return { mockCallLLM: vi.fn(), mockState }
})

vi.mock('@/lib/llm/groq', () => ({
  callLLM: mockCallLLM,
  groqChat: vi.fn(),
  GROQ_MODEL: 'llama-3.3-70b-versatile',
}))

import { registerTool, defineTool } from '@/lib/tools/registry'
import { recordLLMCost } from '@/lib/engine/cost-tracker'
import { loadCases, filterByTag } from './lib/load-cases'
import { executeCase } from './lib/run-case'
import { printResultsTable, persistEvalRun } from './lib/report'
import type { CaseResult } from './lib/types'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Strict, ordered queue: no cycling. Throws if a case didn't provide enough
 *  fixtures for however many calls its run actually makes — this is
 *  deliberate, so an under-specified case fails loudly instead of silently
 *  reusing the wrong canned response. */
function takeNext<T>(queue: T[], label: string): T {
  if (queue.length === 0) {
    throw new Error(`Mock queue "${label}" exhausted — this case needs more fixture entries`)
  }
  return queue.shift() as T
}

mockCallLLM.mockImplementation(async () => {
  const next = takeNext(mockState.llmQueue, 'llmResponses')
  if (next.delayMs) await sleep(next.delayMs)
  const tokensUsed = next.tokensUsed ?? 50
  recordLLMCost('llama-3.3-70b-versatile', tokensUsed)
  return { text: next.text, tokensUsed, toolCalls: [], provider: 'groq' as const }
})

const mockWebSearchTool = defineTool({
  name: 'web_search',
  description: 'Mocked web_search for eval cases',
  schema: z.object({ query: z.string().min(1) }),
  execute: async () => takeNext(mockState.webSearchQueue, 'webSearchResults'),
})

beforeAll(() => {
  // Overrides the real web_search registry entry (registered as a side
  // effect when lib/engine/runner.ts is imported) with the canned version.
  registerTool(mockWebSearchTool)
})

const allCases = loadCases()
const mockCases = filterByTag(allCases, 'mock')
const results: CaseResult[] = []

describe('mock eval suite', () => {
  if (mockCases.length === 0) {
    it('has at least one mock-tagged case', () => {
      expect(mockCases.length).toBeGreaterThan(0)
    })
  }

  for (const evalCase of mockCases) {
    it(`${evalCase.id} — ${evalCase.description}`, async () => {
      mockState.llmQueue = (evalCase.mocks?.llmResponses ?? []).map((r) => ({ ...r }))
      mockState.webSearchQueue = [...(evalCase.mocks?.webSearchResults ?? [])]

      const envOverrides = evalCase.mocks?.env ?? {}
      const savedEnv: Record<string, string | undefined> = {}
      for (const [key, value] of Object.entries(envOverrides)) {
        savedEnv[key] = process.env[key]
        process.env[key] = value
      }

      try {
        const result = await executeCase(evalCase)
        results.push(result)
        if (!result.pass) {
          throw new Error(result.reason ?? 'assertion failed')
        }
      } finally {
        for (const key of Object.keys(envOverrides)) {
          if (savedEnv[key] === undefined) delete process.env[key]
          else process.env[key] = savedEnv[key]
        }
      }
    })
  }

  afterAll(async () => {
    printResultsTable(results, 'mock')
    await persistEvalRun(results, 'mock')
  })
})
