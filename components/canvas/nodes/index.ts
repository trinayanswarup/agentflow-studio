import type { NodeTypes } from 'reactflow'
import { InputNode } from './InputNode'
import { LlmCallNode } from './LLMCallNode'
import { ToolCallNode } from './ToolCallNode'
import { ConditionNode } from './ConditionNode'
import { HumanPauseNode } from './HumanPauseNode'
import { OutputNode } from './OutputNode'

/**
 * Defined outside any component so the reference is stable — React Flow
 * will unmount/remount all nodes if this object changes identity.
 */
export const nodeTypes: NodeTypes = {
  input: InputNode,
  llm_call: LlmCallNode,
  tool_call: ToolCallNode,
  condition: ConditionNode,
  human_pause: HumanPauseNode,
  output: OutputNode,
}

export { InputNode, LlmCallNode, ToolCallNode, ConditionNode, HumanPauseNode, OutputNode }
