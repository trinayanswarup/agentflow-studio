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
  model: 'llama-3.3-70b-versatile',
  messages: messages,
  tools: tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }
  })),
  tool_choice: 'auto'
})
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
- No more than 4 screens
