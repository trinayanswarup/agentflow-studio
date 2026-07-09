# Observability

AgentFlow Studio can send execution traces to [Langfuse](https://langfuse.com) — an LLM
observability platform. Tracing is entirely optional: if it isn't configured, the app runs
exactly as it does without it, with zero added latency or risk of failure.

## Setup

1. Sign up for a free account at [cloud.langfuse.com](https://cloud.langfuse.com).
2. Create a project, then go to **Settings → API Keys** and create a new key pair.
3. Add to `.env.local`:

   ```
   LANGFUSE_SECRET_KEY=sk-lf-...
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_BASEURL=https://cloud.langfuse.com
   ```

4. Add the same three variables to your Vercel project (**Settings → Environment Variables**)
   for production tracing.

### Free tier

Langfuse Cloud's free tier includes 50,000 observations/month (events, spans, and generations
combined), 30-day data retention, and unlimited team members. That's generous for a portfolio
project — a full workflow run typically produces 5–15 observations.

### If you don't configure it

Leave `LANGFUSE_SECRET_KEY` and/or `LANGFUSE_PUBLIC_KEY` unset. Every tracing call in
`lib/observability/langfuse.ts` becomes a silent no-op — no network calls, no errors, no
measurable delay. This is the default state for local development unless you opt in.

## What gets traced

All tracing logic lives in one file: `lib/observability/langfuse.ts`. Every other file that
touches Langfuse imports from there — nothing else in the codebase talks to the SDK directly.

For every workflow run (`WorkflowRunner.run()`), regardless of trigger:

- **One trace**, named after the workflow, with metadata:
  - `workflowId` — the workflow's Supabase ID (when known)
  - `runId` — the Supabase run ID (when known — the CLI script has none)
  - `source` — `"editor"` (a run started from `/run/[id]`), `"eval"` (the eval runner), or
    `"cli"` (`scripts/test-run.ts`)
  - `input` — the run's input string
  - On completion: `output`, and `status` (`completed` / `failed`, with the error message if
    failed)

- **One span per node**, named after the node's label, with metadata `nodeId` and `nodeType`.
  The span's duration covers the node's full execution (including, for `human_pause`, the time
  spent polling for a decision). Ends with the node's output, or `ERROR` level + the error
  message if the node threw.

- **One generation per LLM call** (`callLLM()` in `lib/llm/groq.ts` — the single entry point
  used by `llm_call` nodes, the `evaluate_output` tool, and the eval runner's LLM-judge
  scoring), nested under whichever node span was active when the call was made. Records:
  - `model` — `llama-3.3-70b-versatile`, or the Gemini fallback model if Groq failed
  - `input` — `{ system, prompt }` sent to the model
  - `output` — the model's final text response
  - `usage` — total tokens, from the provider's API response
  - Latency — the generation's start/end timestamps span the full call, including any
    tool-calling round-trips inside the agent loop
  - Tool calls made during the loop are attached as generation metadata
  - If both Groq and the Gemini fallback fail, a failed generation (`ERROR` level, no output) is
    recorded instead of being silently dropped

### Not traced

Tool calls made *outside* an LLM agent loop (a `tool_call` node calling `web_search` directly,
for example) are not separately instrumented — they're covered by their node's span, but don't
get their own generation, since they aren't an LLM call. The `evaluate_output` tool's internal
LLM call *is* traced, since it goes through `callLLM()`.

## Verifying a trace appears

1. Set `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` in `.env.local`.
2. Run a workflow from the CLI: `npx tsx scripts/test-run.ts "Nord Security"`.
3. Open your project at [cloud.langfuse.com](https://cloud.langfuse.com) → **Tracing → Traces**.
   A trace named `Lead Enrichment` should appear within a few seconds (the CLI script flushes
   before exiting).
4. Click into it — you should see one span per node (`Company Name`, `Research Company`,
   `Found Results?`, `Enrichment Brief`, `Quality Check`, `Human Review`, `Final Brief`), with a
   nested generation under `Enrichment Brief` and `Quality Check` showing the Groq call, prompt,
   response, and token usage.

To verify it in the deployed app: run a workflow from `/run/[id]`, or run an eval from `/eval`,
then check the same **Tracing → Traces** view — traces from those routes carry `source: editor`
or `source: eval` in their metadata so you can tell them apart from CLI runs.
