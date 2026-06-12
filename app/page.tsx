import Link from 'next/link'

const STACK = [
  { label: 'Next.js 14', color: 'bg-black text-white' },
  { label: 'TypeScript', color: 'bg-blue-700 text-white' },
  { label: 'React Flow', color: 'bg-purple-700 text-white' },
  { label: 'Groq LLM', color: 'bg-orange-600 text-white' },
  { label: 'Supabase', color: 'bg-green-700 text-white' },
  { label: 'Tailwind CSS', color: 'bg-cyan-700 text-white' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-24">
        {/* Title */}
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-white">
          AgentFlow Studio
        </h1>
        <p className="mb-8 text-sm font-medium text-gray-500 uppercase tracking-wider">
          Visual AI Workflow Builder
        </p>

        {/* Description */}
        <p className="mb-10 text-lg leading-relaxed text-gray-300">
          AgentFlow Studio is a full-stack AI engineering project: drag nodes onto a canvas,
          wire them together, and run them. The execution engine walks the graph, calls LLMs
          via Groq (with Gemini fallback), invokes tools like web search and web fetch, streams
          live trace events over SSE, handles human-in-the-loop review pauses, and stores
          every run in Supabase &mdash; all running server-side inside Next.js API routes.
        </p>

        {/* What it proves */}
        <div className="mb-10">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
            What this demonstrates
          </h2>
          <ul className="space-y-3">
            <li className="flex gap-3 text-gray-300">
              <span className="mt-1 flex-shrink-0 text-purple-400">▸</span>
              <span>
                <span className="font-semibold text-white">Agent infrastructure</span> &mdash;
                custom execution engine with a function-calling loop, multi-tool orchestration,
                conditional branching, human-in-the-loop pauses, and SSE streaming. Not a
                LangChain wrapper &mdash; every layer built from scratch.
              </span>
            </li>
            <li className="flex gap-3 text-gray-300">
              <span className="mt-1 flex-shrink-0 text-green-400">▸</span>
              <span>
                <span className="font-semibold text-white">Eval framework</span> &mdash;
                concurrent test-case runner with three scoring strategies (exact match,
                contains, LLM-as-judge via Groq), aggregate pass-rate stats, and full
                run history persisted to Supabase.
              </span>
            </li>
          </ul>
        </div>

        {/* CTA buttons */}
        <div className="mb-12 flex flex-wrap gap-3">
          <Link
            href="/editor?demo=true"
            className="rounded bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Try the Demo
          </Link>
          <a
            href="https://github.com/trinayanswarup/agentflow-studio"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-gray-700 px-6 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
          >
            GitHub →
          </a>
        </div>

        {/* Stack badges */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Stack
          </p>
          <div className="flex flex-wrap gap-2">
            {STACK.map((s) => (
              <span
                key={s.label}
                className={`rounded px-3 py-1 text-xs font-semibold ${s.color}`}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Nav links */}
        <nav className="mt-16 flex gap-6 border-t border-gray-800 pt-8 text-sm text-gray-500">
          <Link href="/editor" className="hover:text-gray-300">Editor</Link>
          <Link href="/eval" className="hover:text-gray-300">Eval Runner</Link>
        </nav>
      </div>
    </div>
  )
}
