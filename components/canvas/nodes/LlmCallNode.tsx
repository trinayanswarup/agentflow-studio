import { Handle, Position, type NodeProps } from 'reactflow'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'
import { NODE_COLORS } from '../types'

export function LlmCallNode({ data, selected }: NodeProps<AgentNodeData>) {
  const tools = (data.config.tools as string[] | undefined) ?? []
  return (
    <BaseNode color={NODE_COLORS.llm_call} typeLabel="LLM Call" label={data.label} selected={selected}>
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />
      {tools.length > 0 && (
        <div className="mt-1 text-[10px] text-gray-400">{tools.join(', ')}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </BaseNode>
  )
}
