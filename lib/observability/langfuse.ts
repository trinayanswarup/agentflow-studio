// Langfuse observability wrapper. This is the ONLY module in the app that
// imports the langfuse SDK — every call site below goes through here so
// tracing can be disabled or fail without ever touching a workflow run.
//
// If LANGFUSE_SECRET_KEY / LANGFUSE_PUBLIC_KEY are missing, every exported
// function becomes a no-op (see `noopRunTrace` and the early returns in
// `recordGeneration`). Every call into the Langfuse SDK is wrapped in
// try/catch — a tracing failure is logged and swallowed, never thrown.
import { AsyncLocalStorage } from 'node:async_hooks'
import { Langfuse } from 'langfuse'
import type { LangfuseSpanClient, LangfuseTraceClient } from 'langfuse'
import type { NodeExecutionResult, NodeType, ToolCallRecord } from '@/lib/types'

export type TraceSource = 'editor' | 'eval' | 'cli'

/** Either the run's trace or the current node's span — whichever is the
 *  nearest ambient parent for a nested LLM generation. */
type ObservabilityParent = LangfuseTraceClient | LangfuseSpanClient

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ── Client ───────────────────────────────────────────────────────────────

let client: Langfuse | null | undefined

function getClient(): Langfuse | null {
  if (client !== undefined) return client

  const secretKey = process.env.LANGFUSE_SECRET_KEY
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  if (!secretKey || !publicKey) {
    client = null
    return client
  }

  try {
    client = new Langfuse({
      secretKey,
      publicKey,
      baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
    })
  } catch (error) {
    console.warn('[observability] Failed to initialize Langfuse client — tracing disabled', errorMessage(error))
    client = null
  }
  return client
}

/** Flush queued events. Call before a serverless function returns — Vercel
 *  may freeze the process immediately after the response is sent. */
export async function flushObservability(): Promise<void> {
  const lf = client
  if (!lf) return
  try {
    await lf.flushAsync()
  } catch (error) {
    console.warn('[observability] Failed to flush traces', errorMessage(error))
  }
}

// ── Ambient parent (current trace or node span) ─────────────────────────
// Lets recordGeneration() find the right parent for a nested LLM call
// without threading a tracing object through every function signature in
// the engine (callLLM is invoked from llm_call nodes, the eval route's
// LLM-judge, and the evaluate_output tool nested inside an agent loop).
const als = new AsyncLocalStorage<ObservabilityParent>()

// ── Run trace ────────────────────────────────────────────────────────────

export interface RunTrace {
  /** Wrap one node's execution: opens a span, makes it the ambient parent
   *  for any nested LLM generation, and ends the span with the outcome. */
  runNodeSpan(
    params: { nodeId: string; nodeType: NodeType; label: string },
    fn: () => Promise<NodeExecutionResult>
  ): Promise<NodeExecutionResult>
  /** Attach the run's final output/status to the trace. */
  finish(params: { output: string; status: 'completed' | 'failed'; error?: string }): void
}

const noopRunTrace: RunTrace = {
  runNodeSpan: (_params, fn) => fn(),
  finish: () => {},
}

class LangfuseRunTrace implements RunTrace {
  constructor(private readonly trace: LangfuseTraceClient) {}

  async runNodeSpan(
    params: { nodeId: string; nodeType: NodeType; label: string },
    fn: () => Promise<NodeExecutionResult>
  ): Promise<NodeExecutionResult> {
    let span: LangfuseSpanClient | null = null
    try {
      span = this.trace.span({
        name: params.label,
        metadata: { nodeId: params.nodeId, nodeType: params.nodeType },
      })
    } catch (error) {
      console.warn('[observability] Failed to start node span', errorMessage(error))
    }

    const parent: ObservabilityParent = span ?? this.trace

    try {
      const result = await als.run(parent, fn)
      try {
        span?.end({ output: result.output })
      } catch (error) {
        console.warn('[observability] Failed to end node span', errorMessage(error))
      }
      return result
    } catch (error) {
      try {
        span?.end({ level: 'ERROR', statusMessage: errorMessage(error) })
      } catch {
        // ignore — tracing must never mask the real error
      }
      throw error
    }
  }

  finish(params: { output: string; status: 'completed' | 'failed'; error?: string }): void {
    try {
      this.trace.update({
        output: params.output,
        metadata: params.error ? { status: params.status, error: params.error } : { status: params.status },
      })
    } catch (error) {
      console.warn('[observability] Failed to finalize trace', errorMessage(error))
    }
  }
}

/** Start one trace for a workflow run. Returns a no-op if Langfuse isn't
 *  configured or the trace fails to start, so callers never need to branch
 *  on whether tracing is enabled. */
export function startRunTrace(params: {
  workflowName: string
  workflowId?: string
  runId?: string
  source: TraceSource
  input: string
}): RunTrace {
  const lf = getClient()
  if (!lf) return noopRunTrace

  try {
    const trace = lf.trace({
      name: params.workflowName,
      input: params.input,
      metadata: {
        workflowId: params.workflowId,
        runId: params.runId,
        source: params.source,
      },
    })
    return new LangfuseRunTrace(trace)
  } catch (error) {
    console.warn('[observability] Failed to start trace — tracing disabled for this run', errorMessage(error))
    return noopRunTrace
  }
}

// ── LLM generation ───────────────────────────────────────────────────────

export interface GenerationParams {
  provider: 'groq' | 'gemini'
  model: string
  system?: string
  prompt: string
  latencyMs: number
  /** Omitted when the call failed. */
  output?: string
  tokensUsed?: number
  toolCalls?: ToolCallRecord[]
  /** Set when the underlying LLM call threw. */
  error?: string
}

/** Record one generation observation for a completed (or failed) LLM call.
 *  Attaches to the current node span if one is active, otherwise the run
 *  trace, otherwise no-ops (no active run — e.g. tracing disabled). */
export function recordGeneration(params: GenerationParams): void {
  const parent = als.getStore()
  if (!parent) return

  try {
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - Math.max(params.latencyMs, 0))

    const generation = parent.generation({
      name: `${params.provider}-completion`,
      model: params.model,
      input: { system: params.system, prompt: params.prompt },
      startTime,
      endTime,
      ...(params.tokensUsed !== undefined ? { usage: { total: params.tokensUsed, unit: 'TOKENS' as const } } : {}),
      ...(params.toolCalls && params.toolCalls.length > 0 ? { metadata: { toolCalls: params.toolCalls } } : {}),
      ...(params.error ? { level: 'ERROR' as const, statusMessage: params.error } : {}),
    })

    generation.end(
      params.error ? { level: 'ERROR', statusMessage: params.error } : { output: params.output }
    )
  } catch (error) {
    console.warn('[observability] Failed to record generation', errorMessage(error))
  }
}
