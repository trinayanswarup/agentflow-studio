import { Handle, Position, type NodeProps } from 'reactflow'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'
import { NODE_COLORS } from '../types'

export function ToolCallNode({ data, selected }: NodeProps<AgentNodeData>) {
  const toolName = (data.config.toolName as string | undefined) ?? ''
  return (
    <BaseNode color={NODE_COLORS.tool_call} typeLabel="Tool Call" label={data.label} selected={selected}>
      <Handle type="target" position={Position.Top} className="!bg-orange-400" />
      {toolName && (
        <div className="mt-1 text-[10px] text-gray-400">{toolName}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400" />
    </BaseNode>
  )
}
