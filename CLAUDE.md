# CLAUDE.md — AgentFlow Studio

## What this project is

AgentFlow Studio is a visual AI workflow builder. Users drag nodes onto a canvas, connect them, and run them. The execution engine walks the graph, calls LLMs and tools, streams live trace events via SSE, handles human-in-the-loop pauses, and stores runs in Supabase.

This is a portfolio project targeting AI engineering internships (Fixxer, Enpal, 10Clouds, AI Opener, CybelAngel). Build for depth, not breadth.

---

## Stack

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, React Flow
- **Execution engine**: TypeScript, runs server-side in API routes
- **LLM primary**: Groq — `llama-3.3-70b-versatile` via `groq` npm package
- **LLM fallback**: Gemini 1.5 Flash via `@google/generative-ai`
- **Search**: Tavily API via `@tavily/core` (only — no DuckDuckGo)
- **Validation**: Zod — all tool inputs, API route request bodies
- **Database**: Supabase (PostgreSQL)
- **Scripts**: `tsx` for running TypeScript scripts directly
- **Deploy**: Vercel

---

## Project structure

```
agentflow-studio/
├── app/
│   ├── page.tsx                  # Landing page
│   ├── editor/page.tsx           # Workflow editor (React Flow canvas)
│   ├── run/[id]/page.tsx         # Run page with live trace
│   ├── eval/page.tsx             # Eval runner
│   └── api/
│       ├── workflows/route.ts    # CRUD workflows
│       ├── run/route.ts          # Start a run (returns run_id)
│       └── stream/[runId]/route.ts  # SSE stream for live trace
├── lib/
│   ├── engine/
│   │   ├── runner.ts             # Main graph walker
│   │   ├── nodes/                # One file per node type
│   │   │   ├── llm-call.ts
│   │   │   ├── tool-call.ts
│   │   │   ├── condition.ts
│   │   │   ├── human-pause.ts
│   │   │   └── output.ts
│   │   └── context.ts            # Shared context object + template resolution
│   ├── tools/
│   │   ├── registry.ts           # Tool registry Map
│   │   ├── web-fetch.ts
│   │   ├── web-search.ts         # Tavily
│   │   ├── extract-json.ts
│   │   ├── send-webhook.ts
│   │   └── evaluate-output.ts
│   ├── llm/
│   │   ├── groq.ts               # Groq client + function calling loop
│   │   └── gemini.ts             # Gemini fallback
│   ├── supabase/
│   │   ├── client.ts             # Browser client
│   │   └── server.ts             # Server client (service role)
│   └── types.ts                  # All shared TypeScript types
├── components/
│   ├── canvas/                   # React Flow components
│   ├── trace/                    # Live trace panel
│   ├── approval/                 # Human pause UI
│   └── eval/                     # Eval results table
├── CLAUDE.md
├── PRD.md
├── AGENTS.md
└── TESTS.md
```

---

## Critical rules — always follow these

### Never expose secrets

- `SUPABASE_SERVICE_ROLE_KEY` is server-side only — never import in any `'use client'` file
- `GROQ_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY` — server-side only
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe to use client-side
- If a file has `'use client'` at the top, never import from `lib/supabase/server.ts` or any file that uses secret env vars

### Build must pass clean

- Run `npm run build` after every session
- Fix all TypeScript errors before considering a session done
- No `any` types unless absolutely unavoidable — use `unknown` + type guard

### Commit before every session

- The developer commits before starting each Claude Code session as a restore point
- Do not remind the developer to commit — they handle this

### SSE streaming

- Use `ReadableStream` with `TransformStream` for SSE in Next.js App Router
- Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Format: `data: ${JSON.stringify(event)}\n\n`

### Zod validation

- Every tool's `input_schema` must have a matching Zod schema — validate before calling `execute()`
- All API route request bodies validated with Zod before processing
- If validation fails, return a 400 with the Zod error message — never let invalid data reach the engine

### Execution engine

- The engine is pure TypeScript with no framework dependencies
- Context object is a plain `Record<string, unknown>` — keys are `${nodeId}_output`
- Template strings use `{{nodeId_output}}` syntax, resolved before LLM calls
- The agent loop: send messages → if tool_calls returned → execute tool → append result → loop → until text response

### React Flow

- Node state and execution state are separate — don't mix them
- Use a `useWorkflowExecution` hook to bridge SSE events to node visual state
- Node highlight: green = done, red = error, yellow = running, blue = waiting (human_pause)

### Groq function calling format

```typescript
const response = await groq.chat.completions.create({
  model: "llama-3.3-70b-versatile",
  messages: messages,
  tools: tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  })),
  tool_choice: "auto",
});
```

---

## Node types — 6 total

`input` | `llm_call` | `tool_call` | `condition` | `human_pause` | `output`

## Tools — 5 total

`web_fetch` | `web_search` | `extract_json` | `send_webhook` | `evaluate_output`

## Screens — 4 total

Landing | Editor | Run | Eval

---

## Supabase schema

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
  status text not null default 'running', -- running | completed | failed | paused
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id),
  node_id text not null,
  node_label text not null,
  status text not null, -- running | done | error | waiting
  output text,
  error text,
  latency_ms integer,
  tokens_used integer,
  created_at timestamptz default now()
);
```

---

## Environment variables

```
# Server-side only — NEVER use in 'use client' files
GROQ_API_KEY=
GEMINI_API_KEY=
TAVILY_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Safe for client-side
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## What NOT to build

- No auth, no login, no teams
- No billing, no permissions
- No mobile-specific design
- No more than 6 node types
- No more than 5 tools
- No more than 4 screens (plus /templates and /how-it-works added in Phase 2)

---

## Phase 2 conventions (Sessions 7–12)

### Vocabulary

The word **"demo" is replaced with "template" or "workflow"** in all new code, UI, and routes. A user loads a _template_; the thing they build/run is a _workflow_. Keep `?demo=true` working only as a backward-compatible alias for the lead-qualification template.

### Templates

Pre-built workflows live in `lib/templates/`. Each is `{ id, name, description, category, definition }` where `definition` is a complete WorkflowDefinition (fully-configured nodes + edges). The registry is `lib/templates/index.ts`. Four ship with the product:

- **hello** — `input → llm_call → output` (starter, ~2s, no tools)
- **lead-qualification** — search + extract + evaluate + human_pause
- **domain-risk** — search + extract + evaluate + condition-branch + conditional human_pause (security)
- **research-agent** — search + brief + evaluate + condition + loop-back retry (self-correcting)

### Connection rules

- `input`: one output, no input
- `output`: one input, no output
- `condition`: one input, TWO outputs labeled `true` and `false` (handle IDs "true"/"false")
- `human_pause`, `llm_call`, `tool_call`: one input, one output
- Reference any upstream output via `{{slug_output}}` (readable) or `{{nodeId_output}}` (UUID) — both resolve.

### Loop support (added Session 8)

- An edge may point to an already-visited node; the runner follows it but enforces a hard max-iterations-per-node guard (default 3).
- On exceeding the guard, emit a `loop_limit` trace event and take the forward path.
- No new node type — a `condition` whose branch points upstream IS the loop.

### Visual design (Session 10)

- READ `/mnt/skills/public/frontend-design/SKILL.md` before any styling work.
- One accent color, a neutral scale, a consistent type scale and spacing, applied via Tailwind config or CSS variables. No ad-hoc per-component colors.
- Dark theme, made deliberate. The trace panel is the star surface and gets the most polish.

### Environment note (learned during Phase 1)

- `gemini-1.5-flash` is retired (Google 404s it). Use `gemini-2.5-flash`, overridable via `GEMINI_MODEL`.
- `NEXT_PUBLIC_SUPABASE_URL` must be the bare project URL (no `/rest/v1/` suffix).
- `tsconfig.json` needs `"target": "ES2017"` or higher (ES5 can't iterate a Map).
- localStorage is NOT available in this environment — use React state for any "seen"/"dismissed" flags.

---

## Phase 3 — Expansion (Sessions 13–18)

### What's being added

Five features that turn AgentFlow from a workflow runner into a knowledge-aware platform:

1. **JSON Export + Shareable Links** — export workflow as `.json`, generate public read-only `/share/[slug]`
2. **Analytics Dashboard** — `/analytics` page with run counts, avg latency, failure rate per step, last run
3. **Semantic Workflow Search + NL Suggestions** — embed workflows on save, search by natural language
4. **Document Q&A** — upload PDF/Word, chunk + embed, ask questions, get cited answers
5. **PDF → Workflow Import** — upload SOP/process doc, Groq extracts steps, auto-generates workflow

### Embeddings — Hugging Face only (free)

- Model: `sentence-transformers/all-MiniLM-L6-v2` via Hugging Face Inference API
- Dimension: `vector(384)` — NOT 1536 (that's OpenAI, which costs money)
- Call via fetch to `https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2`
- Auth header: `Authorization: Bearer ${process.env.HUGGINGFACE_API_KEY}`
- Response: array of floats, length 384
- All embedding logic lives in `lib/rag/embeddings.ts`

### New env var

```
HUGGINGFACE_API_KEY=   # huggingface.co → Settings → Access Tokens → free, no card
```

### New npm packages

```
pdf-parse    # PDF text extraction
mammoth      # Word doc (.docx) text extraction
```

No `openai` package. No paid APIs.

### New Supabase tables (Phase 3)

```sql
-- Enable pgvector first (run once in Supabase SQL editor):
create extension if not exists vector;

create table workflow_embeddings (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  embedding vector(384) not null,
  content text not null,
  created_at timestamptz default now()
);
create index on workflow_embeddings using ivfflat (embedding vector_cosine_ops);

create table documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  filetype text not null, -- 'pdf' | 'docx'
  uploaded_at timestamptz default now()
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(384) not null,
  created_at timestamptz default now()
);
create index on document_chunks using ivfflat (embedding vector_cosine_ops);

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text not null, -- 'completed' | 'failed'
  failed_step text
);

create table workflow_shares (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  slug text unique not null,
  is_public boolean default true,
  created_at timestamptz default now()
);
```

### New API routes (Phase 3)

```
POST /api/rag/embed-workflow       → embed and upsert workflow into workflow_embeddings
POST /api/rag/search               → semantic search over workflow_embeddings
POST /api/documents/upload         → parse, chunk, embed, store doc + chunks
POST /api/documents/ask            → Q&A against document chunks
POST /api/documents/import-workflow → PDF text → Groq → WorkflowDefinition JSON
GET  /api/analytics                → aggregated stats from runs + run_steps + workflow_runs
POST /api/workflows/[id]/share     → generate slug, insert workflow_shares row
GET  /api/share/[slug]             → return workflow definition for public read-only view
```

### New pages (Phase 3)

```
/analytics          → Workflow Insights dashboard
/documents          → Doc upload + Q&A split panel
/share/[slug]       → Public read-only workflow canvas
```

### Chunking strategy

- Chunk size: 500 tokens (approximate — split by word count, ~4 chars/token)
- Overlap: 50 tokens
- All chunking logic in `lib/rag/chunker.ts`

### What does NOT change in Phase 3

- The execution engine — untouched
- Existing node types, tools, templates
- Existing API routes (workflows CRUD, run, stream, approve, eval)
- Existing Supabase tables (workflows, runs, run_steps, human_approvals)
- The canvas editor, trace panel, eval runner
