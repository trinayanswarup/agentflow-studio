// Ambient "which node is currently executing" context, so deep call sites
// (withRetry wrapping a Groq/HF fetch, callLLMStructured wrapping a judge
// call) can surface a TraceEvent on the run's SSE stream without a tracing
// object threaded through every function signature — same AsyncLocalStorage
// pattern as lib/observability/langfuse.ts, kept separate because this
// concern (the SSE trace panel) is always-on, unlike Langfuse which is
// optional.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { TraceEvent } from '@/lib/types'

interface GuardrailContext {
  nodeId: string
  label: string
  emit: (event: TraceEvent) => void
}

const als = new AsyncLocalStorage<GuardrailContext>()

export function runWithGuardrailContext<T>(ctx: GuardrailContext, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn)
}

/**
 * Build and emit a TraceEvent for the currently-executing node. No-ops if
 * called outside a node's execution (e.g. the eval route's LLM-judge call,
 * which runs after WorkflowRunner.run() has already returned).
 */
export function emitGuardrailTraceEvent(
  build: (ctx: { nodeId: string; label: string }) => TraceEvent
): void {
  const ctx = als.getStore()
  if (!ctx) return
  ctx.emit(build({ nodeId: ctx.nodeId, label: ctx.label }))
}
