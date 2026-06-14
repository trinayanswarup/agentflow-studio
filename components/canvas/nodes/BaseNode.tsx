import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export interface BaseNodeProps {
  borderCls: string
  bgCls: string
  textCls: string
  icon: ReactNode
  typeLabel: string
  label: string
  description: string
  selected: boolean
  extra?: ReactNode
  footer?: ReactNode
  children?: ReactNode
}

export function BaseNode({
  borderCls,
  bgCls,
  textCls,
  icon,
  typeLabel,
  label,
  description,
  selected,
  extra,
  footer,
  children,
}: BaseNodeProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={[
        'relative min-w-[200px] rounded-xl border backdrop-blur-sm',
        borderCls,
        bgCls,
        selected ? 'ring-2 ring-accent-500/50' : '',
      ].join(' ')}
    >
      <div className="p-3">
        {/* Header: icon box + type badge */}
        <div className="mb-2.5 flex items-center gap-2">
          <div
            className={[
              'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border',
              borderCls,
              bgCls,
            ].join(' ')}
          >
            <span className={textCls}>{icon}</span>
          </div>
          <span className="rounded border border-gray-700/40 bg-gray-950/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-gray-400">
            {typeLabel}
          </span>
        </div>

        {/* Node label */}
        <p className="mb-1 text-sm font-semibold leading-tight text-gray-100">{label}</p>

        {/* Description */}
        <p className="text-[11px] leading-relaxed text-gray-400">{description}</p>

        {/* Per-node extras (tool chips, etc.) */}
        {extra}

        {/* Footer row */}
        <div className="mt-2.5 border-t border-gray-800/50 pt-1.5">
          {footer ?? (
            <span className="text-[10px] font-medium uppercase tracking-widest text-gray-500/70">
              → CONNECTED
            </span>
          )}
        </div>
      </div>

      {/* React Flow handles — absolutely positioned within this element */}
      {children}
    </motion.div>
  )
}
