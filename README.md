# AgentFlow Studio

Visual AI workflow builder with a live execution engine — drag nodes onto a canvas, wire them together, and watch the graph execute step by step via a real-time SSE trace panel.

![Trace panel mid-run](docs/screenshots/trace-panel.png)
<!-- Replace with actual screenshot or GIF before presenting -->

**[Live demo](https://agentflow-studio.vercel.app)** — editor, templates, and eval runner work without sign-up. Human-pause demos are recorded locally (see §Templates).

---

## Architecture

```
Browser
  React Flow canvas  ←→  Next.js 14 App Router
         │
         │  POST /api/run  →  creates run row in Supabase, returns runId
         │  GET  /api/stream/[runId]  →  SSE stream
         │
         ▼
  Execution Engine  (lib/engine/)
  ┌─────────────────────────────────────────────────────┐
  │  WorkflowRunner                                     │
  │    buildSlugMap()  — UUID → readable slug aliases   │
  │    graph walker    — visits nodes, tracks visitCounts│
  │    context store   — Record<string, unknown>        │
  │    resolveTemplate() — {{slug_output}} substitution │
  └──────────┬──────────────────────────────────────────┘
             │
     ┌───────┴───────┐
     │               │
  LLM nodes      Tool nodes
  callLLM()      runTool()
     │               │
     ▼               ▼
  Groq                Tool registry
  llama-3.3-70b       web_search · web_fetch
  function calling    extract_json · send_webhook
     │                evaluate_output
     │  (on failure)
     ▼
  Gemini 2.5 Flash
  (fallback)
             │
             ▼
  Supabase (PostgreSQL)
  workflows · runs · run_steps · human_approvals
             │
             ▼
  SSE → useWorkflowExecution hook → trace panel + node highlight state
```

### Why SSE and not WebSockets

SSE is unidirectional server-to-client push over plain HTTP. No upgrade handshake, no persistent connection overhead. Vercel serverless functions support streaming responses natively; WebSockets require a separate process or a paid add-on. For a workflow trace — which is exclusively server→client — SSE is the right primitive.

The stream is a `ReadableStream` passed back as the `Response` body. Each event is `data: ${JSON.stringify(event)}\n\n`. The client connects with the browser's native `EventSource`.

### Why Groq

Free tier, sub-2s inference on `llama-3.3-70b-versatile`, and full function-calling support. The agent loop (`groqChat` in `lib/llm/groq.ts`) sends tools as function declarations, checks `message.tool_calls`, executes them, appends the results, and loops until the model answers in plain text. Max six iterations before erroring.

### Why Gemini as fallback

Gemini 2.5 Flash has a 1M-token context window, which matters when `web_search` returns large result sets and the LLM needs to reason over all of them. If Groq throws any error, `callLLM()` in `groq.ts` transparently retries via `geminiChat()`.

Note: `gemini-1.5-flash` was retired by Google mid-build and now returns a 404. The model is `gemini-2.5-flash`, overridable via `GEMINI_MODEL` env var.

### Why polling for human-pause instead of Supabase Realtime

Supabase Realtime requires a subscription setup on both sides plus WebSocket handling. The human-pause flow is low-frequency — one event per approval, with human review latency measured in seconds to minutes. Polling every 2 s for up to 5 minutes (`lib/engine/nodes/human-pause.ts`) is simpler, has no subscription state to manage, and the latency is imperceptible in a human-review context.

### The slug system

Every node has a UUID id (e.g. `a3f7c1d2`). Writing `{{a3f7c1d2_output}}` in a prompt works but is unreadable. The slug system (`lib/engine/slugs.ts`) derives a readable alias from the node's label at run time:

```
"Score Lead Fit"  →  score_lead_fit
"Web Search"      →  web_search
"Web Search" (duplicate)  →  web_search_2
```

`buildSlugMap(nodes)` returns `Map<nodeId, slug>`. The runner calls it once before walking the graph, then registers both forms in the context:

```typescript
setNodeOutput(context, current.id, result.output)         // {{nodeId_output}}
const slug = slugMap.get(current.id)
if (slug) context[`${slug}_output`] = result.output       // {{slug_output}}
```

Both resolve identically. Workflows saved with UUID references never break when node labels are renamed — the UUID form still resolves.

---

## Failure modes

**Groq unavailable.** `callLLM()` catches any thrown error from `groqChat()`, logs a warning, and calls `geminiChat()` with the same arguments. The trace panel shows which provider answered (`provider: 'groq' | 'gemini'` in `LLMResult`). If both fail, the `step_error` event propagates and the run is marked `failed` in Supabase.

**Tavily rate-limited.** The `web_search` tool calls the Tavily API and returns its result as a plain string. If Tavily returns an error (rate limit, quota exhausted), the tool throws. The agent loop in `groqChat` catches tool errors, formats them as `Error: <message>`, and feeds that string back to the model as the tool result. The model typically recovers — it may rephrase the query, use other results, or acknowledge the failure in its final answer.

**User closes the tab mid-run.** The SSE route (`app/api/stream/[runId]/route.ts`) receives an abort signal from the Next.js request when the client disconnects. The runner is already executing in that same async context, so when the connection dies the stream stops flushing events. The run row in Supabase retains `status = 'running'` — no cleanup hook runs. This is acceptable: runs are append-only and old `running` rows are treated as abandoned, not as active work.

**Tool call fails Zod validation.** Every tool is registered with `defineTool()` from `lib/tools/registry.ts`, which derives `input_schema` from the Zod schema via `z.toJSONSchema()`. Before `execute()` is called, `runTool()` validates the raw input against the Zod schema. On failure, `buildFriendlyError()` constructs a plain-English message naming the tool, the bad field, what was expected, and what was received — for example: `web_search needs 'query' (search query string), but the mapped value was empty — check that the upstream node produced the right output and this argument references it (e.g. {{nodeId_output}})`. This string is returned to the model as the tool result, not thrown as an unhandled exception.

**Loop hits the iteration limit.** The runner tracks a `visitCounts: Map<string, number>` across the walk. When the next node's count reaches `MAX_ITERATIONS_PER_NODE` (3), the runner emits a `loop_limit` trace event and, if the current node is a condition, takes the other branch instead of the loop branch. If the current node is not a condition, the run ends with the last output. The loop guard is also backed by `MAX_STEPS = 100` as a secondary circuit breaker.

---

## War stories

### 1. Zod as single source of truth

Tool inputs need to be validated at runtime (Zod) and described to the LLM as JSON Schema (Groq function declarations). The obvious failure mode is defining them separately and letting them drift — a field required by validation that the LLM doesn't know to supply, or a field the LLM fills in that validation rejects.

The fix is `defineTool()` in `lib/tools/registry.ts`:

```typescript
export function defineTool<TSchema extends z.ZodTypeAny>(options: {
  name: string
  description: string
  schema: TSchema
  execute: (input: z.infer<TSchema>) => Promise<string>
}): Tool<TSchema> {
  const jsonSchema = z.toJSONSchema(options.schema) as Record<string, unknown>
  delete jsonSchema['$schema']
  return { ...options, input_schema: jsonSchema }
}
```

`z.toJSONSchema()` derives the JSON Schema directly from the Zod schema. There is one schema definition, used for both validation and function declaration. They cannot drift.

### 2. The `tool_use_failed` retry

`llama-3.3-70b-versatile` has a quirk: after completing all its tool calls, it sometimes tries to format its final answer *as a tool call* — inventing a non-existent function name. Groq rejects this with a `400` and error code `tool_use_failed`.

The model already has all tool results in its context at that point. Retrying the same call with tools enabled would produce the same hallucinated call. The fix in `groqChat`:

```typescript
if (activeTools.length > 0 && errorMessage(error).includes('tool_use_failed')) {
  console.warn('[llm] Groq rejected a hallucinated tool call — retrying without tools')
  activeTools = []
  continue
}
```

Clearing `activeTools` and continuing the loop forces the model to answer in plain text. It works consistently. This is a known llama quirk, not a Groq bug.

### 3. Human-pause race condition

The SSE stream route persists `step_start` events to Supabase fire-and-forget (no `await`). Under load, the `approve` API endpoint received requests before the `status = 'waiting'` row for the paused node had landed, returning a `409 Conflict`.

The fix: `executeHumanPause()` owns its own Supabase writes **synchronously**, before it begins polling. It upserts the `run_steps` row directly:

```typescript
// Try to update an existing row. If fire-and-forget race lost, insert one.
const { data: updated } = await supabase
  .from('run_steps')
  .update({ status: 'waiting', output: previousOutput })
  .eq('run_id', runId).eq('node_id', node.id).select('id')

if (!updated || updated.length === 0) {
  await supabase.from('run_steps').insert({ run_id: runId, node_id: node.id, ... })
}
```

By the time the `human_pause` SSE event reaches the browser, the `waiting` row is guaranteed present. The approve API can never see a missing row for an active pause.

---

## How to add a new tool

Create a file in `lib/tools/`, use `defineTool`, and call `registerTool` at module level. The runner imports all tool files via side-effect imports in `lib/engine/runner.ts`.

```typescript
// lib/tools/my-tool.ts
import { z } from 'zod'
import { defineTool, registerTool } from '@/lib/tools/registry'

const myTool = defineTool({
  name: 'my_tool',
  description: 'Does a thing.',
  schema: z.object({
    input: z.string().describe('The input to process'),
  }),
  async execute({ input }) {
    return `processed: ${input}`
  },
})

registerTool(myTool)
```

Then add a side-effect import in `lib/engine/runner.ts`:

```typescript
import '@/lib/tools/my-tool'
```

That's it. The tool is now available to `tool_call` nodes (by `toolName`) and to `llm_call` nodes (listed in `config.tools`).

---

## How to add a new node type

**1. Add the type to `lib/types.ts`:**

```typescript
export interface MyNode extends BaseNode {
  type: 'my_node'
  config: { someField: string }
}

// Add to the WorkflowNode union:
export type WorkflowNode = InputNode | LlmCallNode | ... | MyNode
```

**2. Create the executor in `lib/engine/nodes/my-node.ts`:**

```typescript
import type { ExecutionContext, MyNode, NodeExecutionResult } from '@/lib/types'

export async function executeMyNode(
  node: MyNode,
  context: ExecutionContext
): Promise<NodeExecutionResult> {
  // ...
  return { output: 'result', tokensUsed: 0 }
}
```

**3. Register it in `lib/engine/runner.ts`:**

```typescript
case 'my_node':
  return executeMyNode(current as MyNode, context)
```

**4. Add a React Flow component in `components/canvas/nodes/MyNode.tsx`** following the pattern of existing nodes (wraps `BaseNode`, picks a color from the existing palette, adds handles).

**5. Register the component in `components/canvas/nodes/index.ts`:**

```typescript
import { MyNode } from './MyNode'
export const nodeTypes = { ..., my_node: MyNode }
```

---

## How to add a new template

Create a file in `lib/templates/` that exports a `WorkflowDefinition`:

```typescript
// lib/templates/my-template.ts
import type { WorkflowDefinition } from '@/lib/types'

export const myTemplateDefinition: WorkflowDefinition = {
  name: 'My Template',
  nodes: [
    { id: 'input_1', type: 'input', label: 'Input', position: { x: 280, y: 0 }, config: {} },
    // ... more nodes
    { id: 'output_1', type: 'output', label: 'Output', position: { x: 280, y: 240 }, config: {} },
  ],
  edges: [
    { id: 'e1', source: 'input_1', target: 'output_1' },
  ],
}
```

Register it in `lib/templates/index.ts`:

```typescript
import { myTemplateDefinition } from './my-template'

export const templates: Template[] = [
  // ... existing templates
  {
    id: 'my-template',
    name: 'My Template',
    description: 'What it does.',
    category: 'starter',
    definition: myTemplateDefinition,
  },
]
```

The template gallery and `?template=my-template` editor URL both pick it up automatically.

---

## Templates

Four workflows ship with the product. Each demonstrates a different capability of the engine.

### Hello
`input → llm_call → output`

The starter. No tools, no search. Runs in ~2 s. Exists to give a first-time user something working in under a minute. The LLM prompt is `Answer the user's question: {{input_1_output}}`.

### Lead Qualification
`input → web_search → llm_call (extract profile) → tool_call (evaluate_output) → human_pause → output`

Sales/lead-gen workflow. Searches for a company, extracts a structured profile, scores the lead fit on a rubric, then pauses for a human reviewer before outputting the final assessment. Demonstrates: tool calling, structured extraction, eval scoring, human-in-the-loop.

> Human-pause requires `maxDuration > 10s`. On the Vercel Hobby deployment this template runs up to the pause and stops. Full flow is shown in the GIF linked in §Local setup.

### CyberOps Domain Risk Check
`input → web_search → llm_call (extract risk signals) → tool_call (evaluate_output) → condition (score ≥ 7?) → [true: human_pause → output] [false: output]`

Security workflow. Given a domain name, searches for breach history and reputation signals, scores cybersecurity risk 1–10, then branches: high-risk domains go to a human analyst; low-risk domains emit output directly. Demonstrates: true/false branching, conditional human-pause.

### Self-Correcting Research Agent
`input → tool_call (web_search) → llm_call (write brief) → tool_call (evaluate_output) → condition (score < 7?) → [true: loop back to web_search] [false: output]`

The loop is a `condition` node whose `true` branch points back upstream to `web_search` — no special loop node type exists. The runner's `visitCounts` guard caps retries at 3 iterations. If the quality score stays below 7 after 3 searches, the runner emits a `loop_limit` trace event and exits via the `false` branch. Demonstrates: eval-driven self-correction, bounded loops.

---

## Local setup

### Prerequisites

- Node.js 18+
- [Groq](https://console.groq.com) — free, ~1M tokens/day, required for function calling
- [Gemini](https://aistudio.google.com) — free, used as fallback; use model `gemini-2.5-flash`
- [Tavily](https://tavily.com) — free, 1000 requests/month
- [Supabase](https://supabase.com) — free tier, PostgreSQL

### Environment variables

```bash
# Server-side only — never used in 'use client' files
GROQ_API_KEY=         # console.groq.com
GEMINI_API_KEY=       # aistudio.google.com
TAVILY_API_KEY=       # app.tavily.com/home
SUPABASE_SERVICE_ROLE_KEY=   # Supabase project settings → API

# Safe for client-side
NEXT_PUBLIC_SUPABASE_URL=    # bare project URL, no /rest/v1/ suffix
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Supabase migrations

Run the following SQL in the Supabase SQL editor (Project → SQL Editor → New query):

```sql
create table workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  definition_json jsonb not null,
  created_at timestamptz default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id),
  input text not null,
  status text not null default 'running',  -- running | completed | failed | paused
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id),
  node_id text not null,
  node_label text not null,
  status text not null,   -- running | done | error | waiting
  output text,
  error text,
  latency_ms integer,
  tokens_used integer,
  created_at timestamptz default now()
);

create table human_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id) not null,
  node_id text not null,
  action text not null,   -- approve | reject
  edited_output text,
  created_at timestamptz default now()
);

create index on run_steps (run_id);
create index on human_approvals (run_id, node_id);
```

### Run

```bash
git clone https://github.com/trinayanswarup/agentflow-studio
cd agentflow-studio
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Vercel deployment note

Human-pause polls Supabase every 2 s for up to 5 minutes — this exceeds Vercel Hobby's 10 s function timeout. On the deployed URL, human-pause runs are truncated. Everything else (editor, templates, eval runner, all non-pause workflows) works. The full human-pause approve/edit/reject flow is demonstrated via a locally recorded GIF.
