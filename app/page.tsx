import Link from 'next/link'
import { NODE_COLORS } from '@/components/canvas/types'

const MOCK_NODES: { type: keyof typeof NODE_COLORS; eyebrow: string; label: string; state?: 'done' | 'running' }[] = [
  { type: 'input',     eyebrow: 'Input',     label: 'Research Topic',     state: 'done'    },
  { type: 'tool_call', eyebrow: 'Tool Call', label: 'Web Search',         state: 'done'    },
  { type: 'llm_call',  eyebrow: 'LLM Call',  label: 'Write Brief',        state: 'done'    },
  { type: 'condition', eyebrow: 'Condition', label: 'Needs Improvement?', state: 'running' },
  { type: 'output',    eyebrow: 'Output',    label: 'Research Brief'                       },
]

function CanvasMock() {
  return (
    <div
      className="relative flex flex-col items-center gap-0 p-5"
      style={{
        backgroundImage: 'radial-gradient(circle, #2f3542 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
    >
      {MOCK_NODES.map((n, i) => (
        <div key={n.label} className="flex flex-col items-center">
          <div
            className="w-44 rounded-lg border-2 bg-gray-900 px-3 py-2"
            style={{
              borderColor: NODE_COLORS[n.type],
              boxShadow:
                n.state === 'running'
                  ? `0 0 0 3px ${NODE_COLORS[n.type]}55, 0 0 18px -2px ${NODE_COLORS[n.type]}88`
                  : undefined,
            }}
          >
            <div
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: NODE_COLORS[n.type] }}
            >
              {n.eyebrow}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-100">{n.label}</span>
              {n.state === 'done' && <span className="text-[10px] text-green-400">✓</span>}
              {n.state === 'running' && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
              )}
            </div>
          </div>
          {i < MOCK_NODES.length - 1 && <div className="h-4 w-px bg-gray-700" />}
        </div>
      ))}
    </div>
  )
}

function TraceMock() {
  const rows = [
    { dot: 'bg-green-500',  label: 'Web Search',         tag: 'tool_call', metric: '612ms',          pulse: false },
    { dot: 'bg-green-500',  label: 'Write Brief',         tag: 'llm_call',  metric: '1.4s · 488 tok', pulse: false },
    { dot: 'bg-green-500',  label: 'Quality Score',       tag: 'tool_call', metric: '0.9s · 96 tok',  pulse: false },
    { dot: 'bg-yellow-400', label: 'Needs Improvement?',  tag: 'condition', metric: 'running…',        pulse: true  },
  ]
  return (
    <div className="flex flex-col border-l border-gray-800 bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-300">
          Live Trace
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-yellow-400/10 px-2 py-0.5 text-[11px] font-medium text-yellow-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
          Running
        </span>
      </div>
      <div className="flex-1 px-4 py-3">
        {rows.map((r) => (
          <div key={r.label} className="relative flex gap-3">
            <div className="relative flex w-3 flex-shrink-0 justify-center">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-800" />
              <span
                className={`relative mt-[7px] h-2.5 w-2.5 rounded-full ring-4 ring-gray-950 ${r.dot} ${
                  r.pulse ? 'animate-pulse' : ''
                }`}
              />
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-medium ${r.pulse ? 'text-yellow-200' : 'text-gray-100'}`}>
                  {r.label}
                </span>
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
                  {r.tag}
                </span>
              </div>
              <div className="mt-1">
                <span className="rounded bg-gray-800/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-gray-400">
                  {r.metric}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkflowPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-panel">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-950/60 px-3 py-2">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
        </span>
        <span className="ml-2 font-mono text-[11px] text-gray-500">
          run / self-correcting-research-agent
        </span>
      </div>
      {/* Body: canvas + trace */}
      <div className="grid grid-cols-1 sm:grid-cols-[1.1fr_1fr]">
        <CanvasMock />
        <TraceMock />
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#1c1c1c] text-gray-100">
      {/* Top nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-sm font-semibold tracking-tight text-gray-100">
          AgentFlow Studio
        </span>
        <nav className="flex items-center gap-6 text-sm text-gray-400">
          <Link href="/how-it-works" className="transition-colors hover:text-gray-100">
            How it works
          </Link>
          <Link href="/templates" className="transition-colors hover:text-gray-100">
            Templates
          </Link>
          <Link href="/library" className="transition-colors hover:text-gray-100">
            Library
          </Link>
          <Link href="/analytics" className="transition-colors hover:text-gray-100">
            Insights
          </Link>
          <Link href="/documents" className="transition-colors hover:text-gray-100">
            Documents
          </Link>
          <Link href="/eval" className="transition-colors hover:text-gray-100">
            Eval Runner
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 py-16 text-center">
        {/* Subtle radial gradient behind the headline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(99,102,241,0.08)_0%,transparent_70%)]"
        />

        <div className="relative z-10 mx-auto max-w-3xl">
          <h1 className="font-light leading-[1.1] tracking-[-0.02em] text-white text-[clamp(1.75rem,3.5vw,3rem)]">
            Build AI agent workflows
            <br />
            you can watch run, step by step.
          </h1>

          <p className="mx-auto mt-6 max-w-xl font-light leading-[1.6] text-[#a0a0a0] text-[1.0625rem]">
            Drag nodes onto a canvas, wire them together, and run them.{' '}
            A custom execution engine walks the graph, calls LLMs and tools,{' '}
            and streams a live trace — with human-in-the-loop pauses built in.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/templates"
              className="rounded-lg bg-gray-200 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-gray-300"
            >
              Browse Templates
            </Link>
            <Link
              href="/how-it-works"
              className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white/70 transition-colors hover:border-white/40 hover:text-white"
            >
              How it works
            </Link>
          </div>

          <p className="mt-4 text-center text-[13px] text-gray-600">
            or{' '}
            <Link
              href="/editor?template=hello&tour=true"
              className="text-gray-500 underline underline-offset-2 transition-colors hover:text-gray-300"
            >
              open the guided walkthrough →
            </Link>
          </p>

          {/* Product-working visual */}
          <div className="mx-auto mt-8 max-w-4xl">
            <WorkflowPreview />
          </div>
        </div>
      </section>

      {/* What AgentFlow can do */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="mb-6 text-xs font-semibold uppercase tracking-wider text-gray-500">
          What AgentFlow can do
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              {
                emoji: '🎨',
                name: 'Visual Workflow Builder',
                description: 'Drag nodes onto a canvas, connect them, and run your agent pipeline in seconds.',
                href: '/editor',
                note: null,
                cta: 'Open editor',
              },
              {
                emoji: '📋',
                name: 'Template Library',
                description: 'Load a pre-built workflow in one click — lead qualification, research, domain risk.',
                href: '/templates',
                note: null,
                cta: 'Browse templates',
              },
              {
                emoji: '💬',
                name: 'Document Q&A',
                description: 'Upload a PDF or Word doc, ask questions, and get cited answers from the content.',
                href: '/documents',
                note: null,
                cta: 'Upload a document',
              },
              {
                emoji: '⚡',
                name: 'PDF → Workflow Import',
                description: 'Upload a process document and Groq auto-generates a workflow from its steps.',
                href: '/documents',
                note: 'Use the Import as Workflow button',
                cta: 'Try it',
              },
              {
                emoji: '📊',
                name: 'Workflow Insights',
                description: 'Run counts, avg completion times, and step failure rates across all workflows.',
                href: '/analytics',
                note: null,
                cta: 'View insights',
              },
              {
                emoji: '🔗',
                name: 'Export & Share',
                description: 'Download any workflow as JSON or generate a public read-only share link.',
                href: '/editor',
                note: 'Save a workflow first, then use the Export / Share buttons',
                cta: 'Open editor',
              },
            ] as const
          ).map((f) => (
            <div
              key={f.name}
              className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{f.emoji}</span>
                <h3 className="text-sm font-semibold text-white">{f.name}</h3>
              </div>
              <p className="flex-1 text-xs leading-relaxed text-gray-400">{f.description}</p>
              {f.note && (
                <p className="text-[10px] text-gray-600">{f.note}</p>
              )}
              <Link
                href={f.href}
                className="self-start rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100"
              >
                {f.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* What it demonstrates */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="mb-6 text-xs font-semibold uppercase tracking-wider text-gray-500">
          What this demonstrates
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-2 font-semibold text-white">Agent infrastructure</h3>
            <p className="text-sm leading-relaxed text-gray-400">
              A custom execution engine with a function-calling loop, multi-tool orchestration,
              conditional branching, bounded retry loops, human-in-the-loop pauses, and SSE
              streaming. Not a LangChain wrapper — every layer built from scratch.
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-2 font-semibold text-white">Eval framework</h3>
            <p className="text-sm leading-relaxed text-gray-400">
              A concurrent test-case runner with three scoring strategies (exact match, contains,
              LLM-as-judge via Groq), aggregate pass-rate stats, and full run history persisted to
              Supabase.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-6 pb-16">
        <nav className="flex flex-wrap gap-6 border-t border-gray-800 pt-8 text-sm text-gray-500">
          <Link href="/templates" className="hover:text-gray-300">Templates</Link>
          <Link href="/library" className="hover:text-gray-300">Library</Link>
          <Link href="/analytics" className="hover:text-gray-300">Insights</Link>
          <Link href="/documents" className="hover:text-gray-300">Documents</Link>
          <Link href="/how-it-works" className="hover:text-gray-300">How it works</Link>
          <Link href="/editor" className="hover:text-gray-300">Editor</Link>
          <Link href="/eval" className="hover:text-gray-300">Eval Runner</Link>
        </nav>
      </footer>
    </div>
  )
}
