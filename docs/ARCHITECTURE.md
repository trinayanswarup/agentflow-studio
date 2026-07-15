# Architecture

Deeper detail than the README - full failure mode table, remaining engineering decisions, and the slug/reference system.

## Failure modes

| Failure                 | Behavior                                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| Groq unavailable        | Falls back to Gemini 2.5 Flash automatically                              |
| Tavily rate-limited     | Retried with backoff; step marked failed with reason if still failing     |
| Tab closed mid-run      | SSE drops, run continues server-side, state persisted in Supabase         |
| Tool input invalid      | Zod catches it, returns a plain-English error naming the missing argument |
| LLM output fails schema | One retry with the validation error in-prompt; then a clean failure       |
| Run exceeds cost cap    | Aborts cleanly, recorded on the trace                                     |
| Step hangs              | Timeout fails the step instead of freezing the run                        |
| Loop runs forever       | Capped at 3 iterations, takes forward path                                |
| LLM invents fake tool   | Retried without tools                                                     |
| PDF import unparseable  | Groq response validated with Zod, friendly error returned, no crash       |

## Loop guard

A condition node whose branch points back upstream creates a loop. The runner tracks visit counts per node and enforces a hard cap of 3 iterations, emitting a `loop_limit` trace event and continuing forward on overflow. No new node type is needed - the loop is expressed entirely through edge direction.

## Slug system

Node outputs are referenceable in downstream prompts and templates as `{{node_label_output}}` (human-readable) or `{{nodeId_output}}` (UUID). Both resolve simultaneously, so workflows saved before the slug system was introduced - which reference nodes by UUID - continue to work without migration.

## Guardrails and the happy path

Structured output validation, retry policy, cost tracking, and step timeouts are threaded through the engine via `AsyncLocalStorage` (ambient context) rather than new parameters on every function signature. This kept the blast radius small - zero changes to the `Tool` interface or any individual tool file - and means a workflow with no issues preserves the existing happy-path behavior without changing the Tool interface, to how it ran before these guardrails existed.

## Retry policy specifics

`withRetry` allows up to 3 attempts with exponential backoff and jitter (500ms base). It retries only on 429, 5xx status codes, network errors, and timeouts. It does not retry 4xx client errors or Zod validation failures - those are treated as non-transient and fail fast.

## Cost tracking

Each run accumulates an estimated cost from token usage per LLM call, using a per-model pricing map. Exceeding the configured cap (default $0.10/run) aborts the run with a `BUDGET_EXCEEDED` status, recorded as an event on the Langfuse trace if tracing is configured.
