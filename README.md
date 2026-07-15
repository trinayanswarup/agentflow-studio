# AgentFlow Studio

A visual AI workflow builder with a custom execution engine - traced, budgeted, validated, and regression-tested on every commit. Drag nodes onto a canvas, connect them, and run them. Built from scratch, no LangChain or orchestration framework.

**Live**: [agentflow-studio-six.vercel.app](https://agentflow-studio-six.vercel.app) · **Repo**: [github.com/trinayanswarup/agentflow-studio](https://github.com/trinayanswarup/agentflow-studio)

---

## Screenshots

![Live trace panel](public/screenshot-trace.png)
_Nodes light up in real time as the workflow executes. Each step shows latency and token count._

![Workflow canvas](public/screenshot-canvas.png)
_Drag-and-drop canvas with 6 node types. Click any node to configure it._

![Human pause approval](public/screenshot-approval.png)
_Workflows pause for human review. Approve the output, edit it, or reject and stop the run._

![Document Q&A](public/screenshot-docs.png)
_Upload a PDF or Word doc, ask questions, get answers with cited source excerpts._

---

## What it does

| Feature                | Description                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Visual workflow editor | Drag-and-drop canvas, 6 node types, live config panel                                                                                    |
| Execution engine       | Custom graph walker - SSE streaming, Groq function-calling loop, condition branching, loop guard                                         |
| Human-in-the-loop      | Workflows pause for human approval - approve, edit output, or reject                                                                     |
| Eval framework         | Deterministic assertions and optional LLM-as-judge scoring                                                                               |
| Template library       | Lead qualification, domain-risk analysis, and self-correcting research templates - demonstrating tools, conditions, approvals, and loops |
| Semantic search        | Natural language search over saved workflows via pgvector cosine similarity                                                              |
| Document Q&A           | Upload PDF or Word → chunk → embed → ask questions → cited answers                                                                       |
| PDF → workflow import  | Upload an SOP document → Groq extracts steps → workflow appears on canvas                                                                |
| Workflow Insights      | Run counts, avg latency, step failure rates across all workflows                                                                         |
| Export and share       | Download any workflow as JSON or generate a public read-only share link                                                                  |

---

## Production engineering

**Observability (Langfuse)** - every run produces a trace: one span per node, one generation per LLM call recording model, prompt, response, tokens, and latency. No-op when unconfigured.

**Guardrails** - structured output validated with Zod (one retry, then a clean failure - never an unhandled crash), retries with exponential backoff on transient errors, per-run cost caps, and per-step timeouts.

**Eval regression suite** - 89 unit tests and 17 eval cases, including cases that verify the cost cap and timeout guardrails actually fire. Mock evals run in CI on every push with zero API keys; live evals run on demand against real Groq/Tavily, with results logged to Supabase over time.

---

## Architecture

```
Browser (React Flow canvas)
    │
    ├── save workflow ──────────────────────────────► Supabase (workflows)
    │
    └── POST /api/run
            │
            ▼
    WorkflowRunner (TypeScript)
            │  every node wrapped in: Langfuse span · cost check · step timeout
            │
            ├── llm_call ──► withRetry ──► Groq function-calling loop
            │                   │ tool_use response          │ structured output?
            │                   ▼                             ▼
            │               Tool registry              Zod validate → retry once →
            │               (web_search, web_fetch,     clean failure
            │               extract_json, send_webhook,
            │               evaluate_output)
            │                   │ Groq down
            │                   ▼
            │               Gemini 2.5 Flash fallback
            │
            ├── tool_call ─► Tool registry (direct, no LLM)
            ├── condition ─► Expression evaluator → true / false edge
            ├── human_pause → poll Supabase every 2s until approved / rejected
            └── output ────► emit run_complete
                    │
                    ▼
            SSE stream → browser (nodes highlight in real time)
                    │
                    ▼
            Supabase (runs, run_steps, human_approvals, eval_runs)
                    │
                    ▼
            Langfuse (trace: spans + generations + guardrail events)
```

**Why SSE over WebSockets**: unidirectional server→client is all a trace stream needs - no connection upgrade, works natively with Next.js `ReadableStream`.

**Why Groq**: free tier, fast inference, function calling support. Gemini 2.5 Flash is the fallback when Groq is unavailable.

**Why polling for human-pause**: the execution trace already uses a long-lived SSE connection. Adding a separate realtime subscription increased connection and state-management complexity, while polling every two seconds was simpler and sufficient for an interaction that takes seconds to minutes.

---

## Three engineering decisions worth knowing

**Zod as single source of truth** - each tool's input schema is defined once in Zod. The JSON Schema passed to Groq for function-calling is auto-derived via `z.toJSONSchema()` - validation and the LLM tool spec can never drift apart.

**`tool_use_failed` retry** - `llama-3.3-70b-versatile` occasionally invents a fake tool name to format its final answer, which Groq rejects with a 400. The agent loop catches this and retries the same conversation without tools.

**Human-pause race condition** - the SSE stream persists steps fire-and-forget. If Approve is clicked before the async write lands, the approve API finds nothing to update. Fixed by having the human-pause node write its own row synchronously before polling starts.

More decisions (loop guard, `AsyncLocalStorage` context propagation) documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Tests and CI

CI runs type checking, build, lint, unit tests, and mock evals on every push. Live evaluations run manually against real Groq and Tavily APIs.

---

## Tech stack

Next.js 14 · TypeScript · React Flow · Groq · Gemini · Tavily · Supabase (pgvector) · Hugging Face embeddings · Langfuse · Zod · Vitest · Vercel

---

## Built by

Trinayan - Computer Engineering, Vilnius Tech
[github.com/trinayanswarup](https://github.com/trinayanswarup)
