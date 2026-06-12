import type { TraceEvent } from '@/lib/types'

function preview(text: string, max = 100): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

interface Props {
  event: TraceEvent
}

export function TraceItem({ event }: Props) {
  switch (event.type) {
    case 'run_start':
      return (
        <div className="flex items-start gap-2 py-1.5 text-sm text-gray-400">
          <span className="mt-0.5 text-base leading-none">▶</span>
          <div>
            <span className="font-medium text-gray-300">Run started</span>
            {' — '}
            <span className="text-gray-500">&ldquo;{preview(event.input, 60)}&rdquo;</span>
          </div>
        </div>
      )

    case 'step_start':
      return (
        <div className="flex items-start gap-2 py-1.5 text-sm">
          <span className="mt-0.5 animate-pulse text-base leading-none text-yellow-400">⏳</span>
          <div>
            <span className="font-medium text-yellow-300">{event.label}</span>
            <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-500">
              {event.nodeType}
            </span>
          </div>
        </div>
      )

    case 'step_done':
      return (
        <div className="flex items-start gap-2 py-1.5 text-sm">
          <span className="mt-0.5 text-base leading-none text-green-400">✅</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-green-300">{event.label}</span>
              <span className="text-[11px] text-gray-500">
                {event.latencyMs}ms
                {event.tokens > 0 && ` · ${event.tokens} tokens`}
              </span>
            </div>
            {event.output && (
              <div className="mt-0.5 truncate text-[11px] text-gray-400">
                {preview(event.output)}
              </div>
            )}
          </div>
        </div>
      )

    case 'step_error':
      return (
        <div className="flex items-start gap-2 py-1.5 text-sm">
          <span className="mt-0.5 text-base leading-none text-red-400">❌</span>
          <div>
            <span className="font-medium text-red-300">{event.label}</span>
            <span className="ml-2 text-[11px] text-gray-500">{event.latencyMs}ms</span>
            <div className="mt-0.5 text-[11px] text-red-400">{event.error}</div>
          </div>
        </div>
      )

    case 'human_pause':
      return (
        <div className="flex items-start gap-2 py-1.5 text-sm">
          <span className="mt-0.5 text-base leading-none text-blue-400">⏸</span>
          <div>
            <span className="font-medium text-blue-300">{event.label}</span>
            <div className="mt-0.5 text-[11px] text-gray-400">{event.message}</div>
          </div>
        </div>
      )

    case 'run_complete':
      return (
        <div className="flex items-start gap-2 border-t border-gray-800 pt-2 text-sm">
          <span className="mt-0.5 text-base leading-none text-green-400">■</span>
          <div>
            <span className="font-semibold text-green-300">Run complete</span>
            <span className="ml-2 text-[11px] text-gray-500">
              {event.totalLatencyMs}ms · {event.totalTokens} tokens
            </span>
          </div>
        </div>
      )

    case 'run_error':
      return (
        <div className="flex items-start gap-2 border-t border-gray-800 pt-2 text-sm">
          <span className="mt-0.5 text-base leading-none text-red-400">■</span>
          <div>
            <span className="font-semibold text-red-300">Run failed</span>
            <div className="mt-0.5 text-[11px] text-red-400">{event.error}</div>
          </div>
        </div>
      )
  }
}
