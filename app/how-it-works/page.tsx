import Link from 'next/link'

const NODE_TYPES = [
  {
    type: 'Input',
    color: 'border-blue-500 text-blue-400',
    description: 'Entry point. Receives the user\'s text string. Every workflow must start with exactly one Input node.',
    example: 'Company name, domain, research topic…',
  },
  {
    type: 'LLM Call',
    color: 'border-purple-500 text-purple-400',
    description: 'Sends a prompt to Groq (llama-3.3-70b). Can invoke tools in a loop until the model produces a final text response.',
    example: 'Summarise search results, extract JSON, write a draft.',
  },
  {
    type: 'Tool Call',
    color: 'border-orange-500 text-orange-400',
    description: 'Runs one specific tool directly with the arguments you supply. Deterministic — no LLM reasoning involved.',
    example: 'web_search, web_fetch, evaluate_output, extract_json, send_webhook.',
  },
  {
    type: 'Condition',
    color: 'border-yellow-500 text-yellow-400',
    description: 'Evaluates an expression against the current context. Takes the true branch or the false branch. Pointing the true branch back upstream creates a retry loop.',
    example: '{{score_output}} >= 7  |  {{brief_output}} contains "sources"',
  },
  {
    type: 'Human Pause',
    color: 'border-teal-500 text-teal-400',
    description: 'Stops the run and surfaces the current output to a human reviewer. The run only continues after Approve, Edit, or Reject.',
    example: 'Review a generated email before it\'s sent.',
  },
  {
    type: 'Output',
    color: 'border-green-500 text-green-400',
    description: 'End of the workflow. Renders the final result using a template string that may reference any upstream output.',
    example: '{{brief_output}}\n\nScore: {{quality_output}}',
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
    <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-[12px] text-blue-300">
      {children}
    </code>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">
            ← Back
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">How it works</h1>
          <p className="mt-2 text-gray-400">
            A quick guide to nodes, connections, template references, and running a workflow.
          </p>
        </div>

        {/* What is a node */}
        <Section title="What is a node?">
          <p className="text-gray-300 leading-relaxed">
            A node is a single step in your workflow. Each node receives an input (from the user
            or from the previous step), does something — calls an LLM, runs a tool, checks a
            condition — and produces an output. You connect nodes with edges to define the
            execution order.
          </p>
          <p className="mt-3 text-gray-300 leading-relaxed">
            Every node's output is automatically stored in the context under a readable key you
            can reference in any downstream node using <Code>{'{{slug_output}}'}</Code>.
          </p>
        </Section>

        {/* How to connect */}
        <Section title="How to connect nodes">
          <ul className="space-y-2 text-gray-300">
            <li className="flex gap-3">
              <span className="mt-0.5 text-blue-400">1.</span>
              Drag from a node's output handle (the dot at the bottom) to another node's input
              handle (dot at the top).
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 text-blue-400">2.</span>
              <span>
                <span className="text-yellow-400 font-medium">Condition</span> nodes have{' '}
                <strong>two</strong> output handles: a green <span className="text-green-400 font-semibold">true</span> handle (left) and a red{' '}
                <span className="text-red-400 font-semibold">false</span> handle (right). Connect
                each to the appropriate downstream node.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 text-blue-400">3.</span>
              To create a <strong>retry loop</strong>, connect a condition's true (or false)
              branch back to an earlier node. The engine enforces a hard cap of 3 visits per node
              before taking the forward path automatically.
            </li>
          </ul>

          <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900 p-4 text-[13px] text-gray-400">
            <p className="font-semibold text-gray-300 mb-2">Connection rules</p>
            <ul className="space-y-1">
              <li><Code>input</Code> — one output, no inputs</li>
              <li><Code>output</Code> — one input, no outputs</li>
              <li><Code>condition</Code> — one input, two outputs (<span className="text-green-400">true</span> + <span className="text-red-400">false</span>)</li>
              <li><Code>llm_call</Code> / <Code>tool_call</Code> / <Code>human_pause</Code> — one input, one output</li>
            </ul>
          </div>
        </Section>

        {/* Node types table */}
        <Section title="Node types">
          <div className="space-y-3">
            {NODE_TYPES.map((n) => (
              <div
                key={n.type}
                className={`rounded-lg border bg-gray-900 p-4 ${n.color.split(' ')[0]}`}
              >
                <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${n.color.split(' ')[1]}`}>
                  {n.type}
                </div>
                <p className="text-sm text-gray-300">{n.description}</p>
                <p className="mt-1.5 font-mono text-[11px] text-gray-500">{n.example}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Template references */}
        <Section title="Template references — {{slug_output}}">
          <p className="text-gray-300 leading-relaxed">
            Every node that produces output is accessible downstream via a template placeholder.
            The key is built from the node's label:
          </p>
          <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900 p-4 font-mono text-[13px] space-y-2">
            <div>
              <span className="text-gray-500">Node label:</span>{' '}
              <span className="text-white">Web Search</span>
              <span className="mx-2 text-gray-600">→</span>
              <Code>{'{{web_search_output}}'}</Code>
            </div>
            <div>
              <span className="text-gray-500">Node label:</span>{' '}
              <span className="text-white">Quality Score</span>
              <span className="mx-2 text-gray-600">→</span>
              <Code>{'{{quality_score_output}}'}</Code>
            </div>
            <div>
              <span className="text-gray-500">Two nodes both labelled "Extract":</span>
              <div className="mt-1 pl-4 space-y-0.5">
                <div><span className="text-gray-400">first →</span> <Code>{'{{extract_output}}'}</Code></div>
                <div><span className="text-gray-400">second →</span> <Code>{'{{extract_2_output}}'}</Code></div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[13px] text-gray-400">
            The node UUID form also works: <Code>{'{{abc123_output}}'}</Code>. Click any variable in
            the "Available variables" panel (right side of the editor) to copy it to your clipboard.
          </p>
          <p className="mt-2 text-[13px] text-gray-400">
            The <Code>input</Code> node's value is always available as <Code>{'{{input}}'}</Code>.
          </p>
        </Section>

        {/* Tools */}
        <Section title="Built-in tools">
          <p className="mb-3 text-gray-300">
            Five tools are available. An <span className="text-purple-400">LLM Call</span> node can
            use any of them via function calling; a{' '}
            <span className="text-orange-400">Tool Call</span> node runs exactly one.
          </p>
          <div className="rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tool</th>
                  <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">What it does</th>
                </tr>
              </thead>
              <tbody className="bg-gray-900">
                {TOOLS.map((t, i) => (
                  <tr key={t.name} className={i < TOOLS.length - 1 ? 'border-b border-gray-800' : ''}>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-orange-300 align-top">{t.name}</td>
                    <td className="px-4 py-2.5 text-gray-300">{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* How to run */}
        <Section title="How to run a workflow">
          <ol className="space-y-3 text-gray-300">
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-blue-400">1.</span>
              Open the <Link href="/editor" className="text-blue-400 hover:underline">Editor</Link>,
              build your workflow (or load a template), and click{' '}
              <strong className="text-white">Save</strong>.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-blue-400">2.</span>
              You're taken to the Run page. Enter an input in the top bar and click{' '}
              <strong className="text-white">Run</strong>.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-blue-400">3.</span>
              Watch the canvas: nodes highlight in{' '}
              <span className="font-semibold text-yellow-400">yellow</span> while running,{' '}
              <span className="font-semibold text-green-400">green</span> when done,{' '}
              <span className="font-semibold text-red-400">red</span> on error, and{' '}
              <span className="font-semibold text-blue-400">blue</span> when waiting for your
              approval.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-blue-400">4.</span>
              The live trace panel on the right shows each step: output preview, latency, and
              token count. The final result appears at the bottom when the run completes.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 font-semibold text-blue-400">5.</span>
              If a <span className="text-teal-400">Human Pause</span> node is reached, an
              approval card appears in the trace panel. Click{' '}
              <strong className="text-white">Approve</strong>,{' '}
              <strong className="text-white">Edit</strong>, or{' '}
              <strong className="text-white">Reject</strong> to continue.
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
