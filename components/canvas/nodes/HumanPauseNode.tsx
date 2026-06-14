import { Handle, Position, type NodeProps } from 'reactflow'
import { UserCheck } from 'lucide-react'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'

export function HumanPauseNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <BaseNode
      borderCls="border-red-400/40"
      bgCls="bg-red-400/10"
      textCls="text-red-400"
      icon={<UserCheck size={16} />}
      typeLabel="Human Pause"
      label={data.label}
      description="Pauses for human review and approval."
      selected={selected}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-red-400" />
    </BaseNode>
  )
}
