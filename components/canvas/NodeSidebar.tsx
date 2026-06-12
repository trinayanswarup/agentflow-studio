import type { DragEvent } from 'react'
import type { NodeType } from '@/lib/types'
import { NODE_COLORS, NODE_LABELS, NODE_TYPES_LIST } from './types'

const DESCRIPTIONS: Record<NodeType, string> = {
  input: 'Entry point',
  llm_call: 'Run an LLM prompt',
  tool_call: 'Call a tool directly',
  condition: 'True / false branch',
  human_pause: 'Wait for approval',
  output: 'Return result',
}

function onDragStart(e: DragEvent<HTMLDivElement>, nodeType: NodeType) {
  e.dataTransfer.setData('application/reactflow', nodeType)
  e.dataTransfer.effectAllowed = 'move'
}

export function NodeSidebar() {
  return (
    <aside className="flex w-48 flex-shrink-0 flex-col gap-2 overflow-y-auto border-r border-gray-800 bg-gray-950 p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Drag to canvas
      </p>
      {NODE_TYPES_LIST.map((type) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => onDragStart(e, type)}
          className="cursor-grab select-none rounded-lg border-2 bg-gray-900 px-3 py-2 text-sm text-white active:cursor-grabbing"
          style={{ borderColor: NODE_COLORS[type] }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: NODE_COLORS[type] }}
          >
            {NODE_LABELS[type]}
          </div>
          <div className="text-[11px] text-gray-400">{DESCRIPTIONS[type]}</div>
        </div>
      ))}
    </aside>
  )
}
