// Structured-output validation for LLM calls expected to return JSON
// matching a fixed shape (the evaluate_output tool's score/reasoning,
// extract_json's arbitrary object, the eval runner's LLM judge).
//
// Parses the response through a Zod schema. On failure, retries ONCE with
// the validation error appended to the prompt, asking the model to correct
// itself. If the retry also fails, throws OutputValidationError with a
// machine-readable code so callers (and ultimately the runner) never see an
// unhandled exception — it's just another step failure.
import type { ZodType } from 'zod'
import { callLLM, type LLMCallOptions } from '@/lib/llm/groq'
import type { LLMResult } from '@/lib/types'
import { emitGuardrailTraceEvent } from '@/lib/engine/guardrail-events'
import { recordEvent } from '@/lib/observability/langfuse'

export class OutputValidationError extends Error {
  readonly code = 'OUTPUT_VALIDATION_FAILED'
  constructor(message: string) {
    super(message)
    this.name = 'OutputValidationError'
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Pull the first {...} block out of a response that may have prose around it. */
function extractJsonBlock(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error(`No JSON object found in response: ${text.slice(0, 200)}`)
  }
  return text.slice(start, end + 1)
}

interface Attempt<T> {
  ok: boolean
  result: LLMResult
  data?: T
  error?: string
}

async function attempt<T>(options: LLMCallOptions, schema: ZodType<T>): Promise<Attempt<T>> {
  const result = await callLLM(options)

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(extractJsonBlock(result.text))
  } catch (error) {
    return { ok: false, result, error: errorMessage(error) }
  }

  const parsed = schema.safeParse(parsedJson)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    return { ok: false, result, error: issues }
  }

  return { ok: true, result, data: parsed.data }
}

export interface StructuredCallResult<T> {
  data: T
  result: LLMResult
}

/**
 * Calls the LLM and validates its JSON response against `schema`. Retries
 * once (with the validation error appended to the prompt) on failure. Throws
 * OutputValidationError if the retry also fails — never an unhandled/opaque
 * exception.
 */
export async function callLLMStructured<T>(
  options: LLMCallOptions,
  schema: ZodType<T>
): Promise<StructuredCallResult<T>> {
  const first = await attempt(options, schema)
  if (first.ok && first.data !== undefined) {
    return { data: first.data, result: first.result }
  }

  emitGuardrailTraceEvent((ctx) => ({
    type: 'validation_retry',
    nodeId: ctx.nodeId,
    label: ctx.label,
    error: first.error ?? 'unknown validation error',
    timestamp: new Date().toISOString(),
  }))
  recordEvent('validation_retry', { error: first.error })

  const correctionPrompt = `${options.prompt}\n\nYour previous response failed validation: ${first.error}\nRespond again with ONLY the corrected, valid JSON — no markdown fences, no commentary.`

  const second = await attempt({ ...options, prompt: correctionPrompt }, schema)
  if (second.ok && second.data !== undefined) {
    return { data: second.data, result: second.result }
  }

  throw new OutputValidationError(
    `Structured output failed schema validation twice. Last error: ${second.error ?? first.error}`
  )
}
