# Eval suite

## What's covered

17 golden test cases across the four templates (Hello, Lead Qualification, CyberOps Domain Risk, Self-Correcting Research Agent), split into two tags:

- **mock** (13 cases) - all LLM and tool calls mocked. Runs with zero API keys configured. Runs in CI on every push.
- **live** (4 cases) - real calls to Groq and Tavily. Only run manually via `npm run evals:live` or the `eval-full.yml` GitHub Actions workflow (`workflow_dispatch`).

Several mock cases are dedicated regression tests for the Phase 2 guardrails - verifying that `BUDGET_EXCEEDED` and `STEP_TIMEOUT` actually fire under the right conditions, not just that the happy path works.

## Assertion types

Assertions are deterministic wherever possible - exact match, contains, valid JSON against a Zod schema, correct node path executed (e.g. a condition took the expected branch), run completed under a cost threshold, run status is `completed` not `failed`. The eval framework supports LLM-as-judge scoring (used elsewhere in the product's own /eval runner), but this regression suite deliberately uses only deterministic assertions - exact match, contains, schema validation, node path - so that pass/fail here isolates real engine and guardrail regressions from model judging variance.

## Running locally

```bash
npm run evals:mock   # 13/13, no API keys needed
npm run evals:live   # requires real GROQ_API_KEY, TAVILY_API_KEY
npm run evals        # runs both
```

## Results history

Each run writes a row to the `eval_runs` table in Supabase: `run_id`, `timestamp`, `git_sha`, `total`, `passed`, `failed`, `pass_rate`, `results_json`. This means pass-rate is tracked over time and tied to the exact commit, not just checked once and forgotten.

## What's not covered, and why

RAG document Q&A, semantic workflow search, and PDF-to-workflow import don't run through `WorkflowRunner` - they're standalone API routes that call Supabase, the embedding endpoint, or Groq directly. Semantic search and document Q&A also depend on live Supabase state (previously embedded workflows or uploaded documents) that this runner doesn't seed, so testing them deterministically would require either a much larger fixture-seeding step or accepting flaky live-state dependencies. PDF import has a viable path to coverage via a small refactor to accept raw text input directly rather than requiring a file upload - not done in this pass, left as a known gap rather than forcing a brittle test.

## Adding a case

See `docs/ADDING_TOOLS.md` → "Adding an eval case".
