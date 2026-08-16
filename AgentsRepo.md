# AgentsRepo.md — AgentFlow Studio

Guidelines for AI coding agents working in this codebase.

## Read first

Read `CLAUDE.md` fully before writing any code. It contains the stack, project structure, critical rules, and known quirks — including three confirmed bugs and their fixes that must not be reintroduced. Violating any rule in CLAUDE.md is a build failure.

## How this codebase is structured

The execution engine (`lib/engine/`) is pure TypeScript with no framework dependencies. It emits trace events via Node.js EventEmitter and is consumed by the SSE API route. Do not add framework imports to engine files.

The RAG layer (`lib/rag/`) handles embeddings, chunking, and document parsing. All external API calls (HF Inference API) happen here — nowhere else.

Guardrails (`with-retry.ts`, `with-timeout.ts`, `cost-tracker.ts`) and observability (`lib/observability/langfuse.ts`) are threaded through via `AsyncLocalStorage` ambient context, not new function parameters — this avoided touching the `Tool` interface or every tool file. Follow the same pattern for any new cross-cutting concern.

**Two separate tool registries exist on purpose**: `lib/tools/registry.ts` for tools used inside workflow nodes, and `lib/agent/tools.ts` for the standalone Ask Agent feature. Do not merge them — different callers, different purpose.

MCP tools (`lib/mcp/server.ts`) are registered properly on a real `McpServer` instance AND exported as plain callable functions — the plain function is what's actually called in production, since Vercel serverless can't hold a live MCP transport open. Any new MCP tool follows this same dual-export pattern.

API routes (`app/api/`) are thin: validate with Zod, call a lib function, return JSON. Business logic lives in `lib/`, not in routes.

Components (`components/`) are purely presentational. They receive state via props or hooks — they do not call Supabase directly.

## Rules for every change

- No `any` types. Use `unknown` + type guard, or a proper discriminated union.
- `npm run build` must pass clean after every session. Fix all TypeScript errors before finishing.
- All API route request bodies validated with Zod. Return 400 with `z.prettifyError()` on failure.
- Server-side secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `LANGFUSE_SECRET_KEY`, etc.) never appear in any file with `'use client'` at the top.
- New workflow-engine tools go in `lib/tools/registry.ts` — the Zod schema is the single source of truth, JSON Schema for Groq is auto-derived via `z.toJSONSchema()`.
- **When sending a tool schema to Groq specifically**, avoid `pattern`, `format`, and `additionalProperties` keywords — Groq's function-calling only supports a JSON Schema subset, and these keywords have caused the model to silently decline to call the tool. Use a hand-written schema for what's sent to Groq; keep the full Zod schema for actual validation.
- New node types need four things: type in `lib/types.ts`, executor in `lib/engine/nodes/`, case in `lib/engine/runner.ts`, React component in `components/canvas/nodes/`.
- Any structured-output LLM prompt needs a literal inline JSON example of the expected shape — prose-only field descriptions cause smaller models to mirror prose formatting back instead of emitting JSON.
- If a feature writes multiple related rows for the same entity where order matters, serialize the writes. Fire-and-forget writes to sequence-dependent rows have caused two confirmed race-condition bugs in this codebase.
- Tests are offline — no real API calls to Groq, Tavily, Supabase, Hugging Face, or Langfuse. Mock everything external.

## What not to touch

- `lib/engine/runner.ts` loop guard (max 3 iterations per node) — do not increase or remove
- `lib/engine/slugs.ts` — slug dedup logic is tested; do not rewrite
- `lib/mcp/server.ts`'s `detectLikelyCause()` priority order — reordering this reintroduces a confirmed diagnosis-accuracy bug (see CLAUDE.md)
- The persistence serialization in `app/api/stream/[runId]/route.ts` — reverting to fire-and-forget reintroduces a confirmed race condition (see CLAUDE.md)
- Existing Supabase table schemas — add columns only, never drop or rename
- The `tool_use_failed` retry in `lib/llm/groq.ts` — this handles a real GPT-OSS-120B quirk, do not remove
- `lib/schemas/judge-score.ts` — kept shape-only deliberately; do not re-add strict numeric bounds

## Supabase clients

Always use `lib/supabase/server.ts` (service role) for server-side writes. Use `lib/supabase/client.ts` (anon key) only for client-side reads. Never use the anon key for writes that bypass RLS — use the service role key in API routes. RLS is intentionally disabled on this project (single-user portfolio context).

## Testing

```bash
npm test              # run all tests
npm run evals:mock    # eval regression suite, offline
npm run build          # type check + build
```

All new code needs tests. Match the style of existing tests in `lib/engine/` and `app/api/`. Tests go next to the file they test or in the same directory.
