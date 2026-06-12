import type { ExecutionContext, NodeExecutionResult, ToolCallNode } from '@/lib/types'
import { resolveTemplate } from '@/lib/engine/context'
import { getTool, runTool } from '@/lib/tools/registry'

export async function executeToolCall(
  node: ToolCallNode,
  context: ExecutionContext
): Promise<NodeExecutionResult> {
  const tool = getTool(node.config.toolName)

  const args: Record<string, unknown> = {}
  for (const [key, template] of Object.entries(node.config.args)) {
    args[key] = resolveTemplate(template, context)
  }

  // runTool validates against the tool's Zod schema before executing.
  const output = await runTool(tool, args)
  return { output, tokensUsed: 0 }
}
