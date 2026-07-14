# Eval regression suite

A golden-case regression suite for the four shipped templates (Hello, Lead
Qualification, CyberOps Domain Risk Check, Self-Correcting Research Agent).
Each case runs a real `WorkflowRunner` (the same engine `scripts/test-run.ts`
and the app use) and checks deterministic assertions against the result —
no LLM-as-judge scoring in this suite.

## Running it

```powershell
npm run evals:mock   # mock-tagged cases only — zero API keys needed
npm run evals:live   # live-tagged cases only — needs real GROQ_API_KEY / TAVILY_API_KEY
npm run evals        # both, in that order
```

`evals:mock` runs under Vitest (`evals/mock.eval.test.ts`) because it needs
Vitest's module mocking. `evals:live` runs as a plain script
(`scripts/run-evals.ts`) via `tsx`, the same way `scripts/test-run.ts` does.
Both share the same case loader, assertion checker, results table, and
Supabase-writing code in `evals/lib/`.

## Directory layout

```
evals/
├── cases/            # one JSON file per case
├── lib/
│   ├── types.ts       # case schema, assertion schema, result types
│   ├── load-cases.ts  # reads + validates evals/cases/*.json
│   ├── assertions.ts  # checkAssertion() — one function per assertion type
│   ├── run-case.ts    # executeCase() — runs a case through WorkflowRunner
│   └── report.ts      # results table printing + eval_runs persistence
├── mock.eval.test.ts  # Vitest runner for mock-tagged cases
├── eval_runs.sql       # Supabase migration (run once, manually)
└── README.md
```

## Adding a new case

Create a JSON file in `evals/cases/` (filename doesn't matter, `id` does):

```json
{
  "id": "my-new-case",
  "description": "What this case checks and why",
  "tags": ["mock", "hello"],
  "template": "hello",
  "input": "some input string",
  "mocks": {
    "llmResponses": [{ "text": "canned answer" }]
  },
  "assertions": [
    { "type": "status", "expected": "completed" },
    { "type": "contains", "value": "answer" }
  ]
}
```

- `template` must be a valid id from `lib/templates/index.ts` (`hello`,
  `lead-qualification`, `domain-risk`, `research-agent`).
- `tags` must include exactly one of `mock` or `live`, plus any descriptive
  tags you like (`branching`, `loop`, `guardrails`, ...).
- `mocks` is only read by the mock runner — the live runner ignores it.

### Mock fixtures — getting the counts right

`mocks.llmResponses` and `mocks.webSearchResults` are **strict, ordered
queues, not cycling patterns**. You must supply exactly as many entries as
the run will actually consume, in call order, including every loop
iteration and every structured-output validation retry — the mock throws a
clear "queue exhausted" error rather than silently reusing a stale response.
Work out the count from the template definition:

- Every `llm_call` node and every `tool_call` node using `evaluate_output`
  or `extract_json` consumes one `llmResponses` entry per execution (the
  latter two call the LLM internally to judge/extract).
- Every `tool_call` node using `web_search` consumes one `webSearchResults`
  entry per execution.
- A loop (Research Agent) re-executes its `search_1`/`brief_1`/`quality_1`
  nodes once per iteration — multiply accordingly.
- A validation-retry (Phase 2's `OUTPUT_VALIDATION_FAILED` path) means the
  judge's `llmResponses` entry is consumed **twice** for that one step (the
  first attempt and the one retry).

`mocks.env` sets environment variables (e.g. `WORKFLOW_COST_CAP_USD`,
`WORKFLOW_STEP_TIMEOUT_MS`) for the duration of that one case only, then
restores whatever was there before.

## Assertion types

All deterministic — exact-match or contains, never an LLM judging the output.

| Type | Fields | Checks |
| --- | --- | --- |
| `status` | `expected: 'completed' \| 'failed'` | `RunResult.status` |
| `contains` | `value`, `nodeId?` | substring in final output, or a specific node's output |
| `not_contains` | `value`, `nodeId?` | substring absent |
| `node_executed` | `nodeId` | node has at least one `step_done` event |
| `node_not_executed` | `nodeId` | node has no `step_done` event |
| `node_execution_count` | `nodeId`, `count` | exact number of `step_done` events (for loop iteration counts) |
| `valid_json` | `nodeId`, `schema?: 'judgeScore'` | node's output parses as JSON, optionally against a shared Zod schema |
| `max_tokens` | `value` | `RunResult.totalTokens <= value` |
| `max_cost_usd` | `value` | estimated cost (same blended-rate approximation as Phase 2's CostTracker) `<= value` |
| `trace_event_present` | `eventType`, `nodeId?` | a trace event of that type exists (e.g. `loop_limit`, `validation_retry`, `budget_exceeded`, `step_timeout`) |
| `trace_event_absent` | `eventType`, `nodeId?` | no trace event of that type |
| `run_error_code` | `code` | the run's `run_error` event carries this machine-readable code (`OUTPUT_VALIDATION_FAILED`, `BUDGET_EXCEEDED`, `STEP_TIMEOUT`) |

Several cases deliberately regression-test the Phase 2 guardrails
(`hello-budget-exceeded-mock`, `hello-step-timeout-mock`,
`domain-risk-invalid-judge-json-mock`) — this suite exercises Phases 1–2 as
well as the core engine, not just "does the workflow produce roughly the
right text."

## Reading eval_runs history in Supabase

Run `evals/eval_runs.sql` once in the Supabase SQL editor, then query:

```sql
select "timestamp", git_sha, total, passed, failed, pass_rate
from eval_runs
order by "timestamp" desc
limit 20;
```

`results_json` on each row is the full array of per-case results (id,
description, tags, pass, reason, latencyMs, assertionResults) if you need to
drill into what failed on a specific commit. The Supabase write is
fire-and-forget — if `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL`
aren't set (as in local `evals:mock` runs with no `.env.local`), the eval run
itself still passes/fails normally; only the history row is skipped, with a
warning logged.

## What's excluded from this suite, and why

The brief asked for cases covering RAG document Q&A, semantic workflow
search, and PDF-to-workflow import, with permission to skip any that
"genuinely cannot be built deterministically." All three are skipped here,
for related reasons:

- **They aren't `WorkflowRunner`-executed features.** Document Q&A
  (`/api/documents/upload` + `/api/documents/ask`), semantic search
  (`/api/rag/search`), and PDF import (`/api/documents/import-workflow`) are
  standalone Next.js route handlers that call `parseFile`/`embed`/`callLLM`
  and Supabase directly — none of them construct a `WorkflowDefinition` and
  run it through the engine. This eval runner's entire design (one
  execution path: `new WorkflowRunner(...).run(...)`, reused directly by
  both the mock and live runners) is built around workflow execution. Giving
  these three features their own case "kind" and mocking strategy would
  double the runner's surface area for a phase whose brief was the
  execution-engine regression suite — better scoped as its own follow-up if
  these features need hardening.
- **Document Q&A and semantic search also depend on live Supabase state**
  this runner has no way to seed or reset (embedded workflows, uploaded
  document chunks). A "mock" case that depends on whatever happens to be in
  a real project's `workflow_embeddings`/`document_chunks` tables isn't
  reproducible, and stubbing it down to just the cosine-similarity math
  wouldn't actually test relevance ranking — it'd be checkbox coverage of a
  well-known formula, not the feature.
- **PDF import specifically** could be made deterministic with a small,
  legitimate refactor: extracting the route's "parsed text → Groq → Zod-
  validated `WorkflowDefinition`" logic (already separable from the
  multipart-form/`pdf-parse` parts) into a reusable function, then mocking
  `callLLM` to feed it a fixed string. That's a real, buildable path — just
  outside "do only this phase," since it needs a second case "kind" (a
  `WorkflowDefinition` object as the assertion target, not a run output
  string) that nothing else in this suite needs yet.
