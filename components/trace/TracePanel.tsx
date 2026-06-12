'use client'

import { useEffect, useRef } from 'react'
import type { TraceEvent } from '@/lib/types'
import { TraceItem } from './TraceItem'

interface Props {
  events: TraceEvent[]
  finalOutput: string | null
  runStatus: 'idle' | 'starting' | 'running' | 'completed' | 'failed'
  totalTokens: number
  totalLatencyMs: number
}

export function TracePanel({ events, finalOutput, runStatus, totalTokens, totalLatencyMs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-800 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Live Trace
        </span>
        {runStatus === 'running' && (
          <span className="flex items-center gap-1 text-[11px] text-yellow-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
            Running
          </span>
        )}
        {runStatus === 'completed' && (
          <span className="text-[11px] text-green-400">
            {totalLatencyMs}ms · {totalTokens} tok
          </span>
        )}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {events.length === 0 && (
          <p className="mt-4 text-center text-sm text-gray-600">
            Enter a company name and click Run.
          </p>
        )}
        {events.map((event, i) => (
          <TraceItem key={i} event={event} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Final output box */}
      {finalOutput && (
        <div className="flex-shrink-0 border-t border-gray-800 p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-green-400">
            Final Output
          </div>
          <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded border border-gray-700 bg-gray-900 p-3 text-xs text-gray-200">
            {finalOutput}
          </pre>
        </div>
      )}
    </div>
  )
}
