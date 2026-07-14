import type { TraceEvent, NodeType } from '@/lib/types'

function preview(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

// ── Shared timeline primitives ───────────────────────────────────────────────

/**
 * One row on the trace timeline. A vertical rail runs through the gutter; the
 * status dot sits on it (ringed in the panel background so it "cuts" the line).
 */
function Row({
  dotClass,
  pulse = false,
  children,
}: {
  dotClass: string
  pulse?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative flex gap-3">
      <div className="relative flex w-3 flex-shrink-0 justify-center">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-800" />
        <span
          className={`relative mt-[7px] h-2.5 w-2.5 rounded-full ring-4 ring-gray-950 ${dotClass} ${
            pulse ? 'animate-pulse' : ''
          }`}
        />
      </div>
      <div className="min-w-0 flex-1 pb-3">{children}</div>
    </div>
  )
}

/** Monospace metric chip (latency / tokens). */
function Metric({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-gray-800/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-gray-400">
      {children}
    </span>
  )
}

/** Node-type tag chip. */
function TypeTag({ type }: { type: NodeType }) {
  return (
    <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
      {type}
    </span>
  )
}

function OutputPreview({ text }: { text: string }) {
  return (
    <div className="mt-1.5 rounded-md border border-gray-800 bg-gray-900/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-gray-400">
      {preview(text)}
    </div>
  )
}

// ── Trace item ───────────────────────────────────────────────────────────────

interface Props {
  event: TraceEvent
}

export function TraceItem({ event }: Props) {
  switch (event.type) {
    case 'run_start':
      return (
        <Row dotClass="bg-gray-500">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Run started
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-400">
            &ldquo;{preview(event.input, 70)}&rdquo;
          </div>
        </Row>
      )

    case 'step_start':
      return (
        <Row dotClass="bg-yellow-400" pulse>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-yellow-200">{event.label}</span>
            <TypeTag type={event.nodeType} />
            <span className="text-[10px] text-gray-600">running…</span>
          </div>
        </Row>
      )

    case 'step_done':
      return (
        <Row dotClass="bg-green-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-100">{event.label}</span>
            <TypeTag type={event.nodeType} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Metric>{event.latencyMs}ms</Metric>
            {event.tokens > 0 && <Metric>{event.tokens} tok</Metric>}
          </div>
          {event.output && <OutputPreview text={event.output} />}
        </Row>
      )

    case 'step_error':
      return (
        <Row dotClass="bg-red-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-red-300">{event.label}</span>
            <TypeTag type={event.nodeType} />
            <Metric>{event.latencyMs}ms</Metric>
          </div>
          <div className="mt-1.5 rounded-md border border-red-900/60 bg-red-950/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-red-300">
            {event.error}
          </div>
        </Row>
      )

    case 'human_pause':
      return (
        <Row dotClass="bg-accent-500" pulse>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-accent-200">{event.label}</span>
            <span className="text-[10px] uppercase tracking-wider text-accent-400">
              waiting for you
            </span>
          </div>
          {event.message && (
            <div className="mt-1 text-[11px] leading-relaxed text-gray-400">{event.message}</div>
          )}
        </Row>
      )

    case 'loop_limit':
      return (
        <Row dotClass="bg-amber-400">
          <div className="text-sm font-medium text-amber-300">Loop limit reached</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
            {event.label} hit {event.iterations} iterations — taking the forward path.
          </div>
        </Row>
      )

    case 'validation_retry':
      return (
        <Row dotClass="bg-amber-400" pulse>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-amber-300">{event.label}</span>
            <span className="text-[10px] uppercase tracking-wider text-amber-500">
              retrying with corrected prompt
            </span>
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-gray-400">
            Output failed validation: {preview(event.error, 140)}
          </div>
        </Row>
      )

    case 'backoff_retry':
      return (
        <Row dotClass="bg-amber-400" pulse>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-amber-300">{event.label}</span>
            <span className="text-[10px] uppercase tracking-wider text-amber-500">
              retry {event.attempt} in {event.delayMs}ms
            </span>
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-gray-400">
            {preview(event.error, 140)}
          </div>
        </Row>
      )

    case 'step_timeout':
      return (
        <Row dotClass="bg-red-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-red-300">{event.label}</span>
            <Metric>timed out</Metric>
          </div>
          <div className="mt-1.5 rounded-md border border-red-900/60 bg-red-950/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-red-300">
            No response within {event.timeoutMs}ms
          </div>
        </Row>
      )

    case 'budget_exceeded':
      return (
        <Row dotClass="bg-red-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-red-300">Budget exceeded</span>
          </div>
          <div className="mt-1.5 rounded-md border border-red-900/60 bg-red-950/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-red-300">
            {event.label} pushed the run to ${event.totalCostUsd.toFixed(4)}, over the ${event.capUsd} cap — aborting.
          </div>
        </Row>
      )

    case 'run_complete':
      return (
        <Row dotClass="bg-green-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-green-300">Run complete</span>
            <Metric>{event.totalLatencyMs}ms</Metric>
            <Metric>{event.totalTokens} tok</Metric>
          </div>
        </Row>
      )

    case 'run_error':
      return (
        <Row dotClass="bg-red-500">
          <div className="text-sm font-semibold text-red-300">Run failed</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-red-400">{event.error}</div>
        </Row>
      )
  }
}
