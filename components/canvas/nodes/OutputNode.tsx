import { Handle, Position, type NodeProps } from 'reactflow'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'
import { NODE_COLORS } from '../types'

export function OutputNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <BaseNode color={NODE_COLORS.output} typeLabel="Output" label={data.label} selected={selected}>
      <Handle type="target" position={Position.Top} className="!bg-green-400" />
    </BaseNode>
  )
}
