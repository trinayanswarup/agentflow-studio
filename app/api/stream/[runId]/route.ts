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
      runner.on('trace', (event: TraceEvent) => {
        // Stream to client.
        try {
          controller.enqueue(sseChunk(event))
        } catch {
          // Controller already closed (client disconnected).
          return
        }

        // Persist to Supabase (fire-and-forget — failures are logged, not fatal).
        void persistEvent(supabase, runId, event)
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
        await supabase
          .from('run_steps')
          .update({
            status: 'error',
            error: event.error,
            latency_ms: event.latencyMs,
          })
          .eq('run_id', runId)
          .eq('node_id', event.nodeId)
          .eq('status', 'running')
        break

      case 'step_timeout':
        await supabase
          .from('run_steps')
          .update({ status: 'error', error: `Step timed out after ${event.timeoutMs}ms` })
          .eq('run_id', runId)
          .eq('node_id', event.nodeId)
          .eq('status', 'running')
        break

      case 'budget_exceeded':
        await supabase
          .from('run_steps')
          .update({
            status: 'error',
            error: `Budget exceeded: $${event.totalCostUsd.toFixed(4)} > cap $${event.capUsd}`,
          })
          .eq('run_id', runId)
          .eq('node_id', event.nodeId)
          .eq('status', 'running')
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
        break
    }
  } catch (err) {
    console.error('[stream] Supabase persist failed for event', event.type, err)
  }
}
