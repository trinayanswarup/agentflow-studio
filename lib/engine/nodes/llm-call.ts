import type { ExecutionContext, LlmCallNode, NodeExecutionResult } from '@/lib/types'
import { resolveTemplate } from '@/lib/engine/context'
import { getTool } from '@/lib/tools/registry'
import { callLLM } from '@/lib/llm/groq'

export async function executeLlmCall(
  node: LlmCallNode,
  context: ExecutionContext
): Promise<NodeExecutionResult> {
  const prompt = resolveTemplate(node.config.prompt, context)
  const system = node.config.system ? resolveTemplate(node.config.system, context) : undefined
  const tools = (node.config.tools ?? []).map(getTool)

  const result = await callLLM({ prompt, system, tools })
  return { output: result.text, tokensUsed: result.tokensUsed }
}
