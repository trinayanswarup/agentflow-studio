import { Handle, Position, type NodeProps } from 'reactflow'
import { ArrowRightCircle } from 'lucide-react'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'

export function InputNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <BaseNode
      borderCls="border-blue-400/40"
      bgCls="bg-blue-400/10"
      textCls="text-blue-400"
      icon={<ArrowRightCircle size={16} />}
      typeLabel="Input"
      label={data.label}
      description="Entry point. Receives the user's text input."
      selected={selected}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400" />
    </BaseNode>
  )
}
