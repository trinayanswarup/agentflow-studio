import type { ExecutionContext, HumanPauseNode, NodeExecutionResult } from '@/lib/types'
import { resolveTemplate } from '@/lib/engine/context'

/**
 * Session 1 stub: logs the pause and continues immediately, passing the
 * previous node's output through unchanged.
 *
 * Session 6 replaces this with a Supabase poll loop that waits for an
 * approve / edit / reject decision from the run page.
 */
export async function executeHumanPause(
  node: HumanPauseNode,
  context: ExecutionContext,
  previousOutput: string
): Promise<NodeExecutionResult> {
  const message = node.config.message
    ? resolveTemplate(node.config.message, context)
    : 'Paused for human review'
  console.log(`[human_pause] ${node.label}: "${message}" — auto-approving (CLI mode)`)
  return { output: previousOutput, tokensUsed: 0 }
}
