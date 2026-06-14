'use client'

import { useEffect, useRef } from 'react'
import type { TraceEvent } from '@/lib/types'
import { TraceItem } from './TraceItem'
import { HumanApprovalCard, type PendingPause } from '@/components/approval/HumanApprovalCard'

interface Props {
  events: TraceEvent[]
  finalOutput: string | null
  runStatus: 'idle' | 'starting' | 'running' | 'completed' | 'failed'
  totalTokens: number
  totalLatencyMs: number
  runId?: string | null
  pendingHumanPause?: PendingPause | null
  onApprovalDecision?: () => void
}

function StatusPill({ runStatus }: { runStatus: Props['runStatus'] }) {
  if (runStatus === 'running' || runStatus === 'starting') {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-yellow-400/10 px-2 py-0.5 text-[11px] font-medium text-yellow-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
        {runStatus === 'starting' ? 'Starting' : 'Running'}
      </span>
    )
  }
  if (runStatus === 'completed') {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Completed
      </span>
    )
  }
  if (runStatus === 'failed') {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Failed
      </span>
    )
  }
  return <span className="text-[11px] text-gray-600">Idle</span>
}

export function TracePanel({
  events,
  finalOutput,
  runStatus,
  totalTokens,
  totalLatencyMs,
  runId,
  pendingHumanPause,
  onApprovalDecision,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length, pendingHumanPause])

  const showMetrics = runStatus === 'completed' && (totalLatencyMs > 0 || totalTokens > 0)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-950">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-gray-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-300">
            Live Trace
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showMetrics && (
            <span className="rounded bg-gray-800/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-gray-400">
              {totalLatencyMs}ms · {totalTokens} tok
            </span>
          )}
          <StatusPill runStatus={runStatus} />
        </div>
      </div>

      {/* Event list */}
      <div className="scroll-slim flex-1 overflow-y-auto px-4 py-3">
        {events.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-2 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-800 text-gray-600">
              ▶
            </div>
            <p className="text-sm text-gray-500">No run yet</p>
            <p className="max-w-[200px] text-xs text-gray-600">
              Enter an input above and click Run to watch each step stream in.
            </p>
          </div>
        )}

        {events.map((event, i) => (
          <div key={i} className="animate-fade-in-up">
            <TraceItem event={event} />
          </div>
        ))}

        {/* Approval card — shown inline after the human_pause trace item */}
        {pendingHumanPause && runId && (
          <HumanApprovalCard
            runId={runId}
            pause={pendingHumanPause}
            onDecision={onApprovalDecision ?? (() => undefined)}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Final output box */}
      {finalOutput && (
        <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/40 p-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Final Output
          </div>
          <pre className="scroll-slim max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-800 bg-gray-950 p-3 font-mono text-xs leading-relaxed text-gray-200">
            {finalOutput}
          </pre>
        </div>
      )}
    </div>
  )
}
