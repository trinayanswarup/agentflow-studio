import { createServerClient } from '@/lib/supabase/server'
import type { WorkflowDefinition, TraceEvent } from '@/lib/types'
import { WorkflowRunner } from '@/lib/engine/runner'
import { flushObservability } from '@/lib/observability/langfuse'

// Allow up to 5 min for runs with human_pause nodes (requires Vercel Pro).
export const maxDuration = 300

const encoder = new TextEncoder()

function sseChunk(event: TraceEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.name === 'string' &&
    Array.isArray(v.nodes) &&
    Array.isArray(v.edges)
  )
}

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const { runId } = params
  const supabase = createServerClient()

  // Fetch the run to get input and workflow_id.
  const { data: run, error: runError } = await supabase
    .from('runs')
    .select('id, input, status, workflow_id, created_at')
    .eq('id', runId)
    .single()

  if (runError || !run) {
    return new Response(
      `data: ${JSON.stringify({ type: 'run_error', error: 'Run not found', timestamp: new Date().toISOString() })}\n\n`,
      { status: 404, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  const runStatus = (run as { status: string }).status

  // Guard: if the run is already terminal, replay the final event immediately
  // rather than spawning a new WorkflowRunner (which would re-execute everything
  // from scratch). This also handles EventSource auto-reconnect — the browser
  // re-GETs this endpoint after any connection drop, including the natural close
  // after run_complete.
  if (runStatus === 'completed') {
    const event = JSON.stringify({
      type: 'run_complete',
      output: '',   // actual output is stored client-side from the original stream
      totalLatencyMs: 0,
      totalTokens: 0,
      timestamp: new Date().toISOString(),
      restored: true,
    })
    return new Response(`data: ${event}\n\n`, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  if (runStatus === 'failed') {
    const event = JSON.stringify({
      type: 'run_error',
      error: 'Run previously failed',
      timestamp: new Date().toISOString(),
      restored: true,
    })
    return new Response(`data: ${event}\n\n`, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  if (runStatus === 'paused') {
    // Run is paused, waiting for human approval. Restore the pause card on the
    // client by fetching the waiting run_step and re-emitting human_pause.
    const { data: waitingStep } = await supabase
      .from('run_steps')
      .select('node_id, node_label, output')
      .eq('run_id', runId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (waitingStep) {
      // Fetch the workflow definition so we can find the node's message.
      const { data: wfRow } = await supabase
        .from('workflows')
        .select('definition_json')
        .eq('id', (run as { workflow_id: string }).workflow_id)
        .single()
      const pauseDef = isWorkflowDefinition(wfRow?.definition_json) ? wfRow!.definition_json : null
      const pauseNode = pauseDef?.nodes.find((n) => n.id === waitingStep.node_id)
      const message =
        (pauseNode?.config as { message?: string } | undefined)?.message ?? 'Paused for human review'

      const event = JSON.stringify({
        type: 'human_pause',
        nodeId: waitingStep.node_id as string,
        label: (waitingStep.node_label ?? 'Review') as string,
        message,
        previousOutput: (waitingStep.output ?? '') as string,
        timestamp: new Date().toISOString(),
        restored: true,
      })
      return new Response(`data: ${event}\n\n`, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }
  }

  // Fetch the workflow definition (only reached for status 'running' or 'pending').
  const { data: workflowRow, error: wfError } = await supabase
    .from('workflows')
    .select('definition_json')
    .eq('id', (run as { workflow_id: string }).workflow_id)
    .single()

  if (wfError || !workflowRow) {
    return new Response(
      `data: ${JSON.stringify({ type: 'run_error', error: 'Workflow not found', timestamp: new Date().toISOString() })}\n\n`,
      { status: 404, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  if (!isWorkflowDefinition(workflowRow.definition_json)) {
    return new Response(
      `data: ${JSON.stringify({ type: 'run_error', error: 'Workflow definition is malformed', timestamp: new Date().toISOString() })}\n\n`,
      { status: 500, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  const definition = workflowRow.definition_json
  const runner = new WorkflowRunner(definition, runId, {
    workflowId: (run as { workflow_id: string }).workflow_id,
    source: 'editor',
  })


  const stream = new ReadableStream({
    start(controller) {
      // The underlying controller can end up closed/errored from more than
      // one direction: our own two completion paths below (.then/.catch),
      // but also the runtime itself — e.g. the client's EventSource closes
      // its connection immediately upon receiving a terminal event (run_error
      // /run_complete), which can tear down the underlying stream before our
      // own `controller.close()` runs, making even the FIRST call throw
      // ERR_INVALID_STATE. Confirmed via repro: both a forced step_timeout
      // and a human_pause timeout hit this because both paths involve a real
      // delay (flushObservability's network flush, or the 5-minute/overridden
      // poll) between the client seeing the terminal event and this code
      // trying to close — plenty of time for the client to have already
      // disconnected. `isStreamClosed` makes every close/error call after the
      // first a no-op instead of a second attempt; wrapping the actual call in
      // try/catch covers the case where even the *first* attempt fails because
      // something outside this closure already tore the stream down.
      let isStreamClosed = false

      function closeStream(): void {
        if (isStreamClosed) return
        isStreamClosed = true
        try {
          controller.close()
        } catch (err) {
          console.error('[stream] controller.close() failed (stream likely already closed):', err)
        }
      }

      function enqueueEvent(event: TraceEvent): boolean {
        if (isStreamClosed) return false
        try {
          controller.enqueue(sseChunk(event))
          return true
        } catch {
          // Controller already closed (client disconnected) — mark it so we
          // don't keep attempting further enqueues/closes for this stream.
          isStreamClosed = true
          return false
        }
      }

      // Persistence is fire-and-forget from the client's perspective (failures
      // are logged, not fatal), but calls for the SAME run must resolve in the
      // order the events were emitted — an unserialized step_start INSERT can
      // otherwise land in Supabase after its own step_done/step_error UPDATE
      // already ran and no-opped (no matching row yet), permanently orphaning
      // the row at status 'running'. Chaining onto one promise per run fixes that.
      let persistQueue: Promise<void> = Promise.resolve()
      runner.on('trace', (event: TraceEvent) => {
        if (!enqueueEvent(event)) return
        persistQueue = persistQueue.then(() => persistEvent(supabase, runId, event))
      })

      runner
        .run(run.input as string)
        .then(async (result) => {
          void persistWorkflowRun(
            supabase,
            (run as { workflow_id: string }).workflow_id,
            (run as { created_at: string }).created_at,
            result.status,
            result.failedStep
          )
          await flushObservability()
          closeStream()
        })
        .catch(async (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          enqueueEvent({ type: 'run_error', error: message, timestamp: new Date().toISOString() })
          await flushObservability()
          closeStream()
        })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function persistWorkflowRun(
  supabase: ReturnType<typeof createServerClient>,
  workflowId: string,
  startedAt: string,
  status: 'completed' | 'failed',
  failedStep?: string
): Promise<void> {
  try {
    await supabase.from('workflow_runs').insert({
      workflow_id: workflowId,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status,
      failed_step: failedStep ?? null,
    })
  } catch (err) {
    console.error('[stream] workflow_runs insert failed', err)
  }
}

async function persistEvent(
  supabase: ReturnType<typeof createServerClient>,
  runId: string,
  event: TraceEvent
): Promise<void> {
  try {
    switch (event.type) {
      case 'step_start':
        await supabase.from('run_steps').insert({
          run_id: runId,
          node_id: event.nodeId,
          node_label: event.label,
          status: 'running',
        })
        break

      case 'step_done':
        await supabase
          .from('run_steps')
          .update({
            status: 'done',
            output: event.output,
            latency_ms: event.latencyMs,
            tokens_used: event.tokens,
          })
          .eq('run_id', runId)
          .eq('node_id', event.nodeId)
          .eq('status', 'running')
        break

      case 'step_error':
        // Guard on ['running','waiting'] rather than just 'running' — a
        // human_pause node's row is already 'waiting' (written directly by
        // executeHumanPause) by the time a rejection/timeout throws and lands
        // here as a generic step_error, so a 'running'-only guard would miss
        // the row entirely and leave it stuck at 'waiting' forever.
        await supabase
          .from('run_steps')
          .update({
            status: 'error',
            error: event.error,
            error_code: event.code ?? null,
            latency_ms: event.latencyMs,
          })
          .eq('run_id', runId)
          .eq('node_id', event.nodeId)
          .in('status', ['running', 'waiting'])
        break

      case 'step_timeout':
        await supabase
          .from('run_steps')
          .update({
            status: 'error',
            error: `Step timed out after ${event.timeoutMs}ms`,
            error_code: 'STEP_TIMEOUT',
          })
          .eq('run_id', runId)
          .eq('node_id', event.nodeId)
          .in('status', ['running', 'waiting'])
        await supabase.from('guardrail_events').insert({
          run_id: runId,
          node_id: event.nodeId,
          node_label: event.label,
          event_type: 'step_timeout',
          timeout_ms: event.timeoutMs,
        })
        break

      case 'budget_exceeded':
        await supabase
          .from('run_steps')
          .update({
            status: 'error',
            error: `Budget exceeded: $${event.totalCostUsd.toFixed(4)} > cap $${event.capUsd}`,
            error_code: 'BUDGET_EXCEEDED',
          })
          .eq('run_id', runId)
          .eq('node_id', event.nodeId)
          .in('status', ['running', 'waiting'])
        await supabase.from('guardrail_events').insert({
          run_id: runId,
          node_id: event.nodeId,
          node_label: event.label,
          event_type: 'budget_exceeded',
          total_cost_usd: event.totalCostUsd,
          cap_usd: event.capUsd,
        })
        break

      case 'validation_retry':
        await supabase.from('guardrail_events').insert({
          run_id: runId,
          node_id: event.nodeId,
          node_label: event.label,
          event_type: 'validation_retry',
          error_message: event.error,
          output_preview: event.outputPreview,
        })
        break

      case 'backoff_retry':
        await supabase.from('guardrail_events').insert({
          run_id: runId,
          node_id: event.nodeId,
          node_label: event.label,
          event_type: 'backoff_retry',
          attempt: event.attempt,
          delay_ms: event.delayMs,
          http_status: event.httpStatus,
          error_message: event.error,
        })
        break

      case 'human_pause':
        await supabase
          .from('run_steps')
          .update({ status: 'waiting' })
          .eq('run_id', runId)
          .eq('node_id', event.nodeId)
          .eq('status', 'running')
        await supabase
          .from('runs')
          .update({ status: 'paused' })
          .eq('id', runId)
        break

      case 'run_complete':
        await supabase
          .from('runs')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', runId)
        break

      case 'run_error':
        await supabase
          .from('runs')
          .update({ status: 'failed', completed_at: new Date().toISOString() })
          .eq('id', runId)
        await cancelOrphanedSteps(supabase, runId)
        break
    }
  } catch (err) {
    console.error('[stream] Supabase persist failed for event', event.type, err)
  }
}

/**
 * Marks any run_steps row still 'running' or 'waiting' as 'cancelled' once a
 * run has failed. Every persistEvent call for this run is awaited in emission
 * order (see the persistQueue chain above), so by the time this runs, every
 * step_start this run will ever produce has already been inserted — any row
 * still non-terminal genuinely never got a step_done/step_error/step_timeout
 * for it and would otherwise be stuck 'running' forever.
 */
async function cancelOrphanedSteps(
  supabase: ReturnType<typeof createServerClient>,
  runId: string
): Promise<void> {
  await supabase
    .from('run_steps')
    .update({ status: 'cancelled', error: 'Run failed before this step finished.' })
    .eq('run_id', runId)
    .in('status', ['running', 'waiting'])
}
