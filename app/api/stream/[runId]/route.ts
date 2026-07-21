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

  // Fetch the workflow definition.
  const { data: workflowRow, error: wfError } = await supabase
    .from('workflows')
    .select('definition_json')
    .eq('id', run.workflow_id)
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
      // Persistence is fire-and-forget from the client's perspective (failures
      // are logged, not fatal), but calls for the SAME run must resolve in the
      // order the events were emitted — an unserialized step_start INSERT can
      // otherwise land in Supabase after its own step_done/step_error UPDATE
      // already ran and no-opped (no matching row yet), permanently orphaning
      // the row at status 'running'. Chaining onto one promise per run fixes that.
      let persistQueue: Promise<void> = Promise.resolve()
      runner.on('trace', (event: TraceEvent) => {
        // Stream to client.
        try {
          controller.enqueue(sseChunk(event))
        } catch {
          // Controller already closed (client disconnected).
          return
        }

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
          controller.close()
        })
        .catch(async (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          try {
            controller.enqueue(
              sseChunk({ type: 'run_error', error: message, timestamp: new Date().toISOString() })
            )
          } catch {
            // ignore
          }
          await flushObservability()
          controller.close()
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
