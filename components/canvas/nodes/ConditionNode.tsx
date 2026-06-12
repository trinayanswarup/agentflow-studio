import { Handle, Position, type NodeProps } from 'reactflow'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'
import { NODE_COLORS } from '../types'

export function ConditionNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <BaseNode color={NODE_COLORS.condition} typeLabel="Condition" label={data.label} selected={selected}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-400" />
      {/* Two labeled source handles: true (left) and false (right) */}
      <div className="relative mt-4 h-5">
        <span className="absolute left-2 bottom-0 text-[10px] text-green-400">true</span>
        <span className="absolute right-2 bottom-0 text-[10px] text-red-400">false</span>
      </div>
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
