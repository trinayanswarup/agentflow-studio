import Link from 'next/link'

const NODE_TYPES = [
  {
    type: 'Input',
    border: 'border-blue-500',
    text: 'text-blue-400',
    badge: 'bg-blue-500/10 text-blue-400',
    description: "Entry point. Receives the user's text string. Every workflow must start with exactly one Input node.",
    rule: '0 inputs · 1 output',
  },
  {
    type: 'LLM Call',
    border: 'border-purple-500',
    text: 'text-purple-400',
    badge: 'bg-purple-500/10 text-purple-400',
    description: 'Sends a prompt to Groq (llama-3.3-70b). Can invoke tools in a loop until the model produces a final text response.',
    rule: '1 input · 1 output',
  },
  {
    type: 'Tool Call',
    border: 'border-orange-500',
    text: 'text-orange-400',
    badge: 'bg-orange-500/10 text-orange-400',
    description: 'Runs one specific tool directly with the arguments you supply. Deterministic — no LLM reasoning involved.',
    rule: '1 input · 1 output',
  },
  {
    type: 'Condition',
    border: 'border-yellow-500',
    text: 'text-yellow-400',
    badge: 'bg-yellow-500/10 text-yellow-400',
    description: 'Evaluates an expression against the current context. Takes the true branch or the false branch. Pointing the true branch back upstream creates a retry loop.',
    rule: '1 input · 2 outputs (true / false)',
  },
  {
    type: 'Human Pause',
    border: 'border-red-500',
    text: 'text-red-400',
    badge: 'bg-red-500/10 text-red-400',
    description: "Stops the run and surfaces the current output to a human reviewer. The run only continues after Approve, Edit, or Reject.",
    rule: '1 input · 1 output',
  },
  {
    type: 'Output',
    border: 'border-green-500',
    text: 'text-green-400',
    badge: 'bg-green-500/10 text-green-400',
    description: 'End of the workflow. Renders the final result using a template string that may reference any upstream output.',
    rule: '1 input · 0 outputs',
  },
]

const TOOLS = [
  { name: 'web_search', description: 'Tavily search — returns top results for a query.' },
  { name: 'web_fetch', description: 'Fetches a URL and returns cleaned text (max 2 000 chars).' },
  { name: 'evaluate_output', description: 'LLM judge — scores output 1–10 against criteria you write. Returns JSON {score, reasoning}.' },
  { name: 'extract_json', description: 'Asks an LLM to extract structured data from text using a schema you define.' },
  { name: 'send_webhook', description: 'HTTP POST to any URL with a JSON body you configure.' },
]

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-[12px] text-accent-300">
      {children}
    </code>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="mb-6 text-2xl font-semibold tracking-tight text-white">{title}</h2>
      {children}
    </section>
  )
}

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#1c1c1c] text-white">
      <div className="mx-auto max-w-4xl px-6 py-16">
        {/* Header */}
        <div className="mb-14">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">
            ← Back
          </Link>
          <h1 className="mt-6 text-4xl font-bold tracking-tight">How it works</h1>
          <p className="mt-3 text-lg text-gray-400">
            A guide to nodes, connections, template references, and running a workflow.
          </p>
        </div>

        {/* What is a node */}
        <Section title="What is a node?">
          <p className="text-base leading-relaxed text-gray-300">
            A node is a single step in your workflow. Each node receives an input (from the user
            or from the previous step), does something — calls an LLM, runs a tool, checks a
            condition — and produces an output. You connect nodes with edges to define the
            execution order.
          </p>
          <p className="mt-4 text-base leading-relaxed text-gray-300">
            Every node&apos;s output is automatically stored in the context under a readable key
            you can reference in any downstream node using <Code>{'{{slug_output}}'}</Code>.
          </p>
        </Section>

        {/* Node types — card grid */}
        <Section title="Node types">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NODE_TYPES.map((n) => (
              <div
                key={n.type}
                className={`rounded-xl border-2 bg-gray-900/60 p-5 ${n.border}`}
              >
                <div
                  className={`mb-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${n.badge}`}
                >
                  {n.type}
                </div>
                <p className="mb-3 text-sm leading-relaxed text-gray-300">{n.description}</p>
                <p className={`text-[11px] font-medium ${n.text}`}>{n.rule}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* How to connect */}
        <Section title="Connecting nodes">
          <ul className="space-y-3 text-gray-300">
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-accent-400">1.</span>
              Drag from a node&apos;s output handle (the dot at the bottom) to another
              node&apos;s input handle (dot at the top).
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-accent-400">2.</span>
              <span>
                <span className="font-medium text-yellow-400">Condition</span> nodes have{' '}
                <strong>two</strong> output handles: a{' '}
                <span className="font-semibold text-green-400">true</span> handle and a{' '}
                <span className="font-semibold text-red-400">false</span> handle.
                Connect each to the appropriate downstream node.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-accent-400">3.</span>
              To create a <strong>retry loop</strong>, connect a condition&apos;s true branch
              back to an earlier node. The engine enforces a hard cap of 3 visits per node
              before taking the forward path automatically.
            </li>
          </ul>

          <div className="mt-6 rounded-xl border border-gray-700 bg-gray-900 p-5 text-[13px] text-gray-400">
            <p className="mb-3 font-semibold text-gray-300">Connection rules</p>
            <ul className="space-y-1.5">
              <li><Code>input</Code> — 0 inputs · 1 output</li>
              <li><Code>output</Code> — 1 input · 0 outputs</li>
              <li>
                <Code>condition</Code> — 1 input · 2 outputs (
                <span className="text-green-400">true</span> +{' '}
                <span className="text-red-400">false</span>)
              </li>
              <li><Code>llm_call</Code> / <Code>tool_call</Code> / <Code>human_pause</Code> — 1 input · 1 output</li>
            </ul>
          </div>
        </Section>

        {/* Template references */}
        <Section title="Template references">
          <p className="mb-5 text-base leading-relaxed text-gray-300">
            Every node that produces output is accessible downstream via a template placeholder.
            The key is derived from the node&apos;s label — spaces become underscores, all lowercase:
          </p>

          <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-950">
            <div className="border-b border-gray-800 bg-gray-900/60 px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                Examples
              </span>
            </div>
            <div className="space-y-3 p-5 font-mono text-[13px]">
              <div className="flex items-center gap-3">
                <span className="w-44 flex-shrink-0 text-gray-400">Node label:</span>
                <span className="text-white">Web Search</span>
                <span className="text-gray-600">→</span>
                <Code>{'{{web_search_output}}'}</Code>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-44 flex-shrink-0 text-gray-400">Node label:</span>
                <span className="text-white">Quality Score</span>
                <span className="text-gray-600">→</span>
                <Code>{'{{quality_score_output}}'}</Code>
              </div>
              <div className="pt-1">
                <span className="text-gray-500">Two nodes both labelled &quot;Extract&quot;:</span>
                <div className="mt-2 space-y-1 pl-4">
                  <div>
                    <span className="text-gray-500">first</span>
                    <span className="mx-2 text-gray-700">→</span>
                    <Code>{'{{extract_output}}'}</Code>
                  </div>
                  <div>
                    <span className="text-gray-500">second</span>
                    <span className="mx-2 text-gray-700">→</span>
                    <Code>{'{{extract_2_output}}'}</Code>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-[13px] text-gray-400">
            The node UUID form also works: <Code>{'{{abc123_output}}'}</Code>. Click any variable
            in the &quot;Available variables&quot; panel in the editor to copy it to your clipboard.
          </p>
          <p className="mt-2 text-[13px] text-gray-400">
            The <Code>input</Code> node&apos;s value is always available as{' '}
            <Code>{'{{input}}'}</Code>.
          </p>
        </Section>

        {/* Tools */}
        <Section title="Built-in tools">
          <p className="mb-5 text-base text-gray-300">
            Five tools are available. An <span className="text-purple-400">LLM Call</span> node
            can use any of them via function calling; a{' '}
            <span className="text-orange-400">Tool Call</span> node runs exactly one.
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tool</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">What it does</th>
                </tr>
              </thead>
              <tbody className="bg-gray-900">
                {TOOLS.map((t, i) => (
                  <tr key={t.name} className={i < TOOLS.length - 1 ? 'border-b border-gray-800' : ''}>
                    <td className="px-4 py-3 align-top font-mono text-[12px] text-orange-300">{t.name}</td>
                    <td className="px-4 py-3 text-gray-300">{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* How to run */}
        <Section title="Running a workflow">
          <ol className="space-y-4 text-gray-300">
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-accent-400">1.</span>
              Open the <Link href="/editor" className="text-accent-400 hover:underline">Editor</Link>,
              build your workflow (or load a template), and click{' '}
              <strong className="text-white">Save</strong>.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-accent-400">2.</span>
              You&apos;re taken to the Run page. Enter an input in the top bar and click{' '}
              <strong className="text-white">Run</strong>.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-accent-400">3.</span>
              <p>
                Watch the canvas: nodes highlight in{' '}
                <span className="font-semibold text-yellow-400">yellow</span> while running,{' '}
                <span className="font-semibold text-green-400">green</span> when done,{' '}
                <span className="font-semibold text-red-400">red</span> on error, and{' '}
                <span className="font-semibold text-accent-400">indigo</span> when waiting for
                your approval.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-accent-400">4.</span>
              The live trace panel on the right shows each step: output preview, latency, and
              token count. The final result appears at the bottom when the run completes.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-accent-400">5.</span>
              <p>
                If a <span className="text-red-400">Human Pause</span> node is reached, an
                approval card appears in the trace panel. Click{' '}
                <strong className="text-white">Approve</strong>,{' '}
                <strong className="text-white">Edit</strong>, or{' '}
                <strong className="text-white">Reject</strong> to continue.
              </p>
            </li>
          </ol>
        </Section>

        {/* Footer nav */}
        <nav className="flex gap-6 border-t border-gray-800 pt-8 text-sm text-gray-500">
          <Link href="/templates" className="hover:text-gray-300">Browse Templates</Link>
          <Link href="/editor" className="hover:text-gray-300">Editor</Link>
          <Link href="/eval" className="hover:text-gray-300">Eval Runner</Link>
        </nav>
      </div>
    </div>
  )
}
