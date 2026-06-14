import { Handle, Position, type NodeProps } from 'reactflow'
import { CheckCircle2 } from 'lucide-react'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'

export function OutputNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <BaseNode
      borderCls="border-emerald-400/40"
      bgCls="bg-emerald-400/10"
      textCls="text-emerald-400"
      icon={<CheckCircle2 size={16} />}
      typeLabel="Output"
      label={data.label}
      description="Renders the final result from upstream outputs."
      selected={selected}
      footer={
        <span className="text-[10px] font-medium uppercase tracking-widest text-gray-500/70">
          → END
        </span>
      }
    >
      <Handle type="target" position={Position.Top} className="!bg-emerald-400" />
    </BaseNode>
  )
}
