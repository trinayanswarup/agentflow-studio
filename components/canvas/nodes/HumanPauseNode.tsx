import { Handle, Position, type NodeProps } from 'reactflow'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'
import { NODE_COLORS } from '../types'

export function HumanPauseNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <BaseNode color={NODE_COLORS.human_pause} typeLabel="Human Pause" label={data.label} selected={selected}>
      <Handle type="target" position={Position.Top} className="!bg-red-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-red-400" />
    </BaseNode>
  )
}
