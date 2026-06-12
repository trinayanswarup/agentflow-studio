import type { ReactNode } from 'react'

interface BaseNodeProps {
  color: string
  typeLabel: string
  label: string
  selected: boolean
  children?: ReactNode
}

export function BaseNode({ color, typeLabel, label, selected, children }: BaseNodeProps) {
  return (
    <div
      style={{
        borderColor: color,
        boxShadow: selected ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : undefined,
      }}
      className="min-w-[160px] rounded-lg border-2 bg-gray-900 px-3 py-2 text-sm text-white"
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
        {typeLabel}
      </div>
      <div className="font-medium leading-tight">{label}</div>
      {children}
    </div>
  )
}
