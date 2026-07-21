# ClaudeRepo.md — AgentFlow Studio

## What this is

A visual AI workflow builder. Users drag nodes onto a canvas, connect them, and run them. The execution engine walks the graph, calls LLMs via Groq function-calling, invokes tools, streams live trace events over SSE, and handles human-in-the-loop pauses. It's also traced via Langfuse, protected by guardrails, regression-tested, and includes an MCP-based agent that diagnoses why a run failed.

## Stack

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, React Flow
- **Engine**: TypeScript, server-side API routes, SSE via ReadableStream
- **LLM**: Groq llama-3.3-70b-versatile (primary), Gemini 2.5 Flash (fallback)
- **Search**: Tavily API only
- **Embeddings**: Hugging Face sentence-transformers/all-MiniLM-L6-v2 (384-dim) via router.huggingface.co
- **Vector search**: Supabase pgvector, ivfflat index, cosine similarity via <=> operator
- **Observability**: Langfuse — no-op when unconfigured
- **Protocol**: Model Context Protocol (MCP) — @modelcontextprotocol/sdk
- **Validation**: Zod on all tool inputs, API route bodies, and structured LLM outputs
- **Database**: Supabase (PostgreSQL)
- **Deploy**: Vercel

## Project structure

```
app/
  page.tsx                          # Landing
  editor/page.tsx                   # Workflow canvas
  run/[id]/page.tsx                 # Live trace + human approval + "Investigate failure"
  eval/page.tsx                     # Eval runner
  templates/page.tsx                # Template gallery + semantic search
  library/page.tsx                  # Saved workflows
  documents/page.tsx                # Doc upload + Q&A + import
  analytics/page.tsx                # Workflow insights
  share/[slug]/page.tsx             # Public read-only canvas
  how-it-works/page.tsx             # Guided walkthrough
  agent/page.tsx                    # Ask Agent — failure-debugging chat UI
  api/
    workflows/                      # CRUD
    run/                            # Start run, approve human-pause
    stream/[runId]/                 # SSE trace stream (serialized persistence)
    eval/                           # Eval test cases
    rag/                            # Embed workflow, semantic search
    documents/                      # Upload, ask, import-workflow
    analytics/                      # Aggregated run stats
    share/                          # Generate + resolve share slug
    mcp/                            # Thin wrapper routes for MCP tools
    agent/ask/                      # Ask Agent loop endpoint
lib/
  engine/
    runner.ts                       # Graph walker, loop guard, cycle detection,
                                     # Langfuse span/cost check/timeout per node
    context.ts                      # {{slug_output}} and {{nodeId_output}} resolution
    nodes/                          # One executor per node type
    slugs.ts                        # Label → slug, dedup, buildSlugMap
    with-retry.ts                   # Exponential backoff + jitter guardrail
    with-timeout.ts                 # AbortController-based per-step timeout
    cost-tracker.ts                 # Per-run cost accumulator
    pricing-config.ts               # Per-model token pricing
  tools/
    registry.ts                     # Tool registry Map (workflow-engine tools)
    web-search.ts / web-fetch.ts / extract-json.ts / send-webhook.ts / evaluate-output.ts
  agent/
    tools.ts                        # SEPARATE registry for Ask Agent's own tools
  llm/
    groq.ts                         # Function-calling agent loop + tool_use_failed retry
    gemini.ts                       # Fallback client
    structured-output.ts            # callLLMStructured() — validate/retry/fail cleanly
  mcp/
    server.ts                       # MCP-compliant tool definitions, also exported as
                                     # plain callable functions (thin wrapper pattern)
  observability/
    langfuse.ts                     # Ambient tracing via AsyncLocalStorage, silent no-op
                                     # when unconfigured
  rag/
    embeddings.ts                   # embed() → float[384] via HF Inference API
    chunker.ts                      # chunkText() — 500 token chunks, 50 overlap
    parser.ts                       # parseFile() — pdf-parse (require) + mammoth
    embed-workflow.ts               # Serialize workflow → embed → upsert
  templates/
    index.ts                        # Template registry
    hello.ts / lead-qualification.ts / domain-risk.ts / research-agent.ts
  supabase/
    client.ts                       # Browser client (anon key)
    server.ts                       # Server client (service role key — never in 'use client')
  types.ts                          # All shared TypeScript types
components/
  canvas/                           # React Flow nodes, sidebar, config panel
  trace/                            # Live trace panel, trace items
  approval/                         # Human pause card (approve/edit/reject)
  eval/                             # Results table, aggregate stats
  onboarding/                       # Guided tour overlay
evals/
  cases/                            # Golden test cases, tagged mock/live
  lib/                              # Eval infra: types, load-cases, assertions, run-case
  mock.eval.test.ts                 # Offline mock eval runner
```

## Critical rules

### Secrets

- `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY`, `HUGGINGFACE_API_KEY`, `LANGFUSE_SECRET_KEY` — server-side only, never in any `'use client'` file
- Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BASE_URL`, `LANGFUSE_PUBLIC_KEY` are safe client-side

### Build

- No `any` types — use `unknown` + type guard
- `npm run build` must pass clean after every change
- All API route bodies validated with Zod before processing

### SSE

- `ReadableStream` + `TransformStream` in Next.js App Router
- Format: `data: ${JSON.stringify(event)}\n\n`
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- **Persistence must be serialized per run** — a fire-and-forget write pattern here caused a confirmed race condition where a step's completion could reach the database before its own creation record, leaving it stuck at `status: running` indefinitely

### Embeddings

- HF endpoint: `https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction`
- Response is `number[][]` — return `response[0]`, length 384
- Vector columns are `vector(384)` — not 1536
- All four templates must be saved at least once for semantic search to find them

### Known quirks

- `gemini-1.5-flash` is retired — use `gemini-2.5-flash` (overridable via `GEMINI_MODEL`)
- `NEXT_PUBLIC_SUPABASE_URL` must be the bare project URL — no `/rest/v1/` suffix
- `tsconfig.json` needs `"target": "ES2017"` or higher — ES5 cannot iterate a Map
- `localStorage` is not available in this environment — use React state for dismissed/seen flags
- `sessionStorage` IS available in the browser — used for cross-page workflow import handoff
- `pdf-parse` must be imported via `require('pdf-parse/lib/pdf-parse')` inside the function body, pinned to `pdf-parse@1.1.1` — top-level import or newer versions trigger a test file read that crashes Next.js
- Dev server may run on port 3001 if 3000 is in use — check terminal output
- MCP tools are defined MCP-compliant but not served over a live transport in production — Vercel serverless can't hold a persistent MCP connection open. Each tool is also a plain callable function, called directly by the Ask Agent route.

## Node types

`input` | `llm_call` | `tool_call` | `condition` | `human_pause` | `output`

## Tools

Workflow engine: `web_search` | `web_fetch` | `extract_json` | `send_webhook` | `evaluate_output`
Ask Agent (separate registry): `search_docs` | `get_run_details` | `get_guardrail_events`

## Environment variables

```
GROQ_API_KEY=
GEMINI_API_KEY=
TAVILY_API_KEY=
HUGGINGFACE_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BASE_URL=
LANGFUSE_SECRET_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_BASEURL=
WORKFLOW_COST_CAP_USD=
WORKFLOW_STEP_TIMEOUT_MS=
```
