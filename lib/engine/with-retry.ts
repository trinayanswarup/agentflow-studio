// Shared retry wrapper for transient failures (429, 5xx, network errors,
// timeouts) with exponential backoff + jitter. Used by lib/llm/groq.ts
// (Groq API calls) and lib/rag/embeddings.ts (Hugging Face calls).
//
// Does NOT retry other 4xx client errors or Zod validation failures — those
// indicate a bad request/response shape that a retry won't fix.
import { emitGuardrailTraceEvent } from '@/lib/engine/guardrail-events'
import { recordEvent } from '@/lib/observability/langfuse'

export interface RetryOptions {
  /** Total attempts, including the first. Default 3. */
  maxAttempts?: number
  /** Base delay in ms for exponential backoff. Default 500. */
  baseDelayMs?: number
  /** Injectable RNG for deterministic tests (defaults to Math.random). */
  randomFn?: () => number
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 500

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Pull an HTTP status code off an error object, if it has one. */
function extractStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const record = error as Record<string, unknown>
  if (typeof record.status === 'number') return record.status
  if (typeof record.statusCode === 'number') return record.statusCode
  return undefined
}

function isRetryableError(error: unknown): boolean {
  const status = extractStatusCode(error)

  // A well-formed HTTP status is authoritative: retry 429/5xx, never other 4xx.
  if (status !== undefined) {
    return status === 429 || (status >= 500 && status < 600)
  }

  // No status code — likely a connection failure, timeout, or abort rather
  // than a well-formed client error (which SDKs normally attach a status to).
  if (error instanceof Error) {
    const name = error.constructor?.name ?? error.name
    if (/Connection|Timeout|Network|Abort/i.test(name)) return true
    if (/network|fetch failed|econnreset|etimedout|enotfound|timed?\s?out/i.test(error.message)) {
      return true
    }
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs `fn`, retrying on transient failures with exponential backoff + jitter.
 * Each retry is recorded as a Langfuse event and a 'backoff_retry' TraceEvent
 * (both no-ops if there's no active run/trace context).
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const random = options.randomFn ?? Math.random

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableError(error)) {
        throw error
      }

      const delayMs = Math.round(baseDelayMs * 2 ** (attempt - 1) + random() * baseDelayMs)
      const message = errorMessage(error)
      const httpStatus = extractStatusCode(error) ?? null

      emitGuardrailTraceEvent((ctx) => ({
        type: 'backoff_retry',
        nodeId: ctx.nodeId,
        label: ctx.label,
        attempt,
        delayMs,
        error: message,
        httpStatus,
        timestamp: new Date().toISOString(),
      }))
      recordEvent('backoff_retry', { attempt, delayMs, error: message, httpStatus })

      await sleep(delayMs)
    }
  }

  // Unreachable — the loop always returns or throws — but keeps TS happy.
  throw new Error('withRetry: exhausted attempts without returning or throwing')
}
