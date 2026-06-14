import { Handle, Position, type NodeProps } from 'reactflow'
import { GitBranch } from 'lucide-react'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'

export function ConditionNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <BaseNode
      borderCls="border-yellow-400/40"
      bgCls="bg-yellow-400/10"
      textCls="text-yellow-400"
      icon={<GitBranch size={16} />}
      typeLabel="Condition"
      label={data.label}
      description="Evaluates an expression; branches true or false."
      selected={selected}
      footer={
        <div className="flex justify-between">
          <span className="text-[10px] font-medium uppercase tracking-widest text-green-400/70">
            → TRUE
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-red-400/70">
            → FALSE
          </span>
        </div>
      }
    >
      <Handle type="target" position={Position.Top} className="!bg-yellow-400" />
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ left: '25%' }}
        className="!bg-green-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: '75%' }}
        className="!bg-red-400"
      />
    </BaseNode>
  )
}
