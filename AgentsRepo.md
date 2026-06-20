# AGENTS.md — AgentFlow Studio

Guidelines for AI coding agents working in this codebase.

## Read first

Read `CLAUDE.md` fully before writing any code. It contains the stack, project structure, critical rules, and known quirks. Violating any rule in CLAUDE.md is a build failure.

## How this codebase is structured

The execution engine (`lib/engine/`) is pure TypeScript with no framework dependencies. It emits trace events via Node.js EventEmitter and is consumed by the SSE API route. Do not add framework imports to engine files.

The RAG layer (`lib/rag/`) handles embeddings, chunking, and document parsing. All external API calls (HF Inference API) happen here — nowhere else.

API routes (`app/api/`) are thin: validate with Zod, call a lib function, return JSON. Business logic lives in `lib/`, not in routes.

Components (`components/`) are purely presentational. They receive state via props or hooks — they do not call Supabase directly.

## Rules for every change

- No `any` types. Use `unknown` + type guard, or a proper discriminated union.
- `npm run build` must pass clean after every session. Fix all TypeScript errors before finishing.
- All API route request bodies validated with Zod. Return 400 with `z.prettifyError()` on failure.
- Server-side secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, etc.) never appear in any file with `'use client'` at the top.
- New tools must be added to `lib/tools/registry.ts` — the Zod schema is the single source of truth, JSON Schema for Groq is auto-derived via `z.toJSONSchema()`.
- New node types need four things: type in `lib/types.ts`, executor in `lib/engine/nodes/`, case in `lib/engine/runner.ts`, React component in `components/canvas/nodes/`.
- Tests are offline — no real API calls to Groq, Tavily, Supabase, or Hugging Face. Mock everything external.

## What not to touch

- `lib/engine/runner.ts` loop guard (max 3 iterations per node) — do not increase or remove
- `lib/engine/slugs.ts` — slug dedup logic is tested; do not rewrite
- Existing Supabase table schemas — add columns only, never drop or rename
- The `tool_use_failed` retry in `lib/llm/groq.ts` — this handles a real llama quirk, do not remove

## Supabase clients

Always use `lib/supabase/server.ts` (service role) for server-side writes. Use `lib/supabase/client.ts` (anon key) only for client-side reads. Never use the anon key for writes that bypass RLS — use the service role key in API routes.

## Testing

```bash
npm test          # run all tests
npm run build     # type check + build
```

All new code needs tests. Match the style of existing tests in `lib/engine/` and `app/api/`. Tests go next to the file they test or in the same directory.
