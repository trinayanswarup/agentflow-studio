import { Handle, Position, type NodeProps } from 'reactflow'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'
import { NODE_COLORS } from '../types'

export function InputNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <BaseNode color={NODE_COLORS.input} typeLabel="Input" label={data.label} selected={selected}>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400" />
    </BaseNode>
  )
}
