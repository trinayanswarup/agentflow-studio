import { Handle, Position, type NodeProps } from 'reactflow'
import { Brain } from 'lucide-react'
import { BaseNode } from './BaseNode'
import type { AgentNodeData } from '../types'

export function LlmCallNode({ data, selected }: NodeProps<AgentNodeData>) {
  const tools = (data.config.tools as string[] | undefined) ?? []
  return (
    <BaseNode
      borderCls="border-purple-400/40"
      bgCls="bg-purple-400/10"
      textCls="text-purple-400"
      icon={<Brain size={16} />}
      typeLabel="LLM Call"
      label={data.label}
      description="Calls Groq LLM with your prompt and optional tools."
      selected={selected}
      extra={
        tools.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tools.map((t) => (
              <span
                key={t}
                className="rounded bg-purple-400/10 px-1.5 py-0.5 text-[10px] text-purple-400/80"
              >
                {t}
              </span>
            ))}
          </div>
        ) : undefined
      }
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </BaseNode>
  )
}
