import { createServerClient } from '@/lib/supabase/server'
import type { ExecutionContext, HumanPauseNode, NodeExecutionResult } from '@/lib/types'
import { resolveTemplate } from '@/lib/engine/context'

const POLL_INTERVAL_MS = 2_000
const MAX_POLLS = 150 // 5 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Waits for a human approval decision stored in the `human_approvals` table.
 * Falls back to auto-approve when no runId is in context (CLI / eval mode).
 *
 * Required Supabase tables:
 *   human_approvals (run_id, node_id, action, edited_output, created_at)
 *
 * This node writes its own run_steps/runs state directly instead of relying
 * on the stream route's fire-and-forget persistEvent — that avoids the race
 * where the UI tries to approve before the 'waiting' row exists.
 */
export async function executeHumanPause(
  node: HumanPauseNode,
  context: ExecutionContext,
  previousOutput: string
): Promise<NodeExecutionResult> {
  const runId = context['__runId'] as string | undefined

  if (!runId) {
    const message = node.config.message
      ? resolveTemplate(node.config.message, context)
      : 'Paused for human review'
    console.log(`[human_pause] ${node.label}: "${message}" — auto-approving (no runId)`)
    return { output: previousOutput, tokensUsed: 0 }
  }

  const supabase = createServerClient()

  // ── Write paused state to Supabase before polling ────────────────────────
  // Try to update an existing run_step row (inserted by the stream route's
  // step_start handler). If none exists yet (fire-and-forget race), insert one.
  const { data: updated } = await supabase
    .from('run_steps')
    .update({ status: 'waiting', output: previousOutput })
    .eq('run_id', runId)
    .eq('node_id', node.id)
    .select('id')

  if (!updated || updated.length === 0) {
    await supabase.from('run_steps').insert({
      run_id: runId,
      node_id: node.id,
      node_label: node.label,
      status: 'waiting',
      output: previousOutput,
    })
  }

  await supabase.from('runs').update({ status: 'paused' }).eq('id', runId)

  // ── Poll human_approvals every 2 s (max 5 min) ───────────────────────────
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS)

    const { data, error } = await supabase
      .from('human_approvals')
      .select('action, edited_output')
      .eq('run_id', runId)
      .eq('node_id', node.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('[human_pause] poll error:', error.message)
      continue
    }

    if (data) {
      if (data.action === 'reject') {
        throw new Error('Rejected by human reviewer')
      }
      const output =
        typeof data.edited_output === 'string' && data.edited_output.trim()
          ? data.edited_output
          : previousOutput
      return { output, tokensUsed: 0 }
    }
  }

  throw new Error('Human pause timed out — no decision received within 5 minutes')
}
