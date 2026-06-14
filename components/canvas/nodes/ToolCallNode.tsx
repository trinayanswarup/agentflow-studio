import { Handle, Position, type NodeProps } from 'reactflow'
import { Wrench } from 'lucide-react'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'

export function ToolCallNode({ data, selected }: NodeProps<AgentNodeData>) {
  const toolName = (data.config.toolName as string | undefined) ?? ''
  return (
    <BaseNode
      borderCls="border-orange-400/40"
      bgCls="bg-orange-400/10"
      textCls="text-orange-400"
      icon={<Wrench size={16} />}
      typeLabel="Tool Call"
      label={data.label}
      description="Runs one tool directly with your arguments."
      selected={selected}
      extra={
        toolName ? (
          <div className="mt-1.5">
            <span className="rounded bg-orange-400/10 px-1.5 py-0.5 text-[10px] text-orange-400/80">
              {toolName}
            </span>
          </div>
        ) : undefined
      }
    >
      <Handle type="target" position={Position.Top} className="!bg-orange-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400" />
    </BaseNode>
  )
}
