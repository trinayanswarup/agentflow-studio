import { z } from 'zod'

// ── Assertions ───────────────────────────────────────────────────────────
// Deterministic only — no LLM-as-judge. Each checks something observable
// from a WorkflowRunner RunResult (final output, per-node output, trace
// events, token count).

export const assertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), expected: z.enum(['completed', 'failed']) }),
  z.object({ type: z.literal('contains'), value: z.string(), nodeId: z.string().optional() }),
  z.object({ type: z.literal('not_contains'), value: z.string(), nodeId: z.string().optional() }),
  z.object({ type: z.literal('node_executed'), nodeId: z.string() }),
  z.object({ type: z.literal('node_not_executed'), nodeId: z.string() }),
  z.object({ type: z.literal('node_execution_count'), nodeId: z.string(), count: z.number().int().min(0) }),
  z.object({ type: z.literal('valid_json'), nodeId: z.string(), schema: z.enum(['judgeScore']).optional() }),
  z.object({ type: z.literal('max_tokens'), value: z.number().positive() }),
  z.object({ type: z.literal('max_cost_usd'), value: z.number().positive() }),
  z.object({ type: z.literal('trace_event_present'), eventType: z.string(), nodeId: z.string().optional() }),
  z.object({ type: z.literal('trace_event_absent'), eventType: z.string(), nodeId: z.string().optional() }),
  z.object({ type: z.literal('run_error_code'), code: z.string() }),
])
export type Assertion = z.infer<typeof assertionSchema>

// ── Mock fixtures (mock-tagged cases only — ignored by the live runner) ──

const llmResponseSchema = z.object({
  text: z.string(),
  /** Defaults to 50 if omitted. */
  tokensUsed: z.number().int().min(0).optional(),
  /** Artificial delay before resolving — used to exercise WORKFLOW_STEP_TIMEOUT_MS. */
  delayMs: z.number().int().min(0).optional(),
})

const mockConfigSchema = z.object({
  /**
   * Exact, ordered list of canned callLLM() responses this case's run will
   * consume — one per llm_call node execution AND one per internal judge
   * call made by evaluate_output/extract_json. No cycling: the case author
   * must account for every call (including loop iterations and
   * validation-retry attempts), so a case's queue never desyncs.
   */
  llmResponses: z.array(llmResponseSchema).optional(),
  /**
   * Exact, ordered list of canned web_search tool outputs (pre-formatted
   * text, one per search_1-style tool_call node execution).
   */
  webSearchResults: z.array(z.string()).optional(),
  /** Env vars to set for the duration of this case only (e.g. WORKFLOW_COST_CAP_USD). */
  env: z.record(z.string(), z.string()).optional(),
})
export type MockConfig = z.infer<typeof mockConfigSchema>

// ── Case ─────────────────────────────────────────────────────────────────

export const evalCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  /** Must include exactly one of 'mock' | 'live', plus any descriptive tags. */
  tags: z.array(z.string()).min(1),
  /** Template id from lib/templates/index.ts (hello, lead-qualification, domain-risk, research-agent). */
  template: z.string().min(1),
  input: z.string(),
  mocks: mockConfigSchema.optional(),
  assertions: z.array(assertionSchema).min(1),
})
export type EvalCase = z.infer<typeof evalCaseSchema>

// ── Results ──────────────────────────────────────────────────────────────

export interface AssertionResult {
  assertion: Assertion
  pass: boolean
  reason?: string
}

export interface CaseResult {
  id: string
  description: string
  tags: string[]
  pass: boolean
  reason?: string
  latencyMs: number
  assertionResults: AssertionResult[]
}
