import type { ExecutionContext, NodeExecutionResult, OutputNode } from '@/lib/types'
import { resolveTemplate } from '@/lib/engine/context'

/**
 * Terminal node. With a template, the final output is the resolved template;
 * otherwise it is the previous node's output passed through.
 */
export async function executeOutput(
  node: OutputNode,
  context: ExecutionContext,
  previousOutput: string
): Promise<NodeExecutionResult> {
  const output = node.config.template
    ? resolveTemplate(node.config.template, context)
    : previousOutput
  return { output, tokensUsed: 0 }
}
