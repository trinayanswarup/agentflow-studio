# Local setup

**Prerequisites**: Node 20+, a Supabase project with the `vector` extension enabled

```bash
git clone https://github.com/trinayanswarup/agentflow-studio
cd agentflow-studio
npm install
cp .env.example .env.local
# fill in all values below
npm run dev
```

## Environment variables

```
GROQ_API_KEY=              # groq.com - free
GEMINI_API_KEY=            # aistudio.google.com - free
TAVILY_API_KEY=            # tavily.com - free, 1000 req/month
HUGGINGFACE_API_KEY=       # huggingface.co - free
NEXT_PUBLIC_SUPABASE_URL=  # bare project URL - no /rest/v1/ suffix
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY= # server-side only, never expose client-side
NEXT_PUBLIC_BASE_URL=      # http://localhost:3000 locally

# Optional - no-op / sensible defaults if unset
LANGFUSE_SECRET_KEY=       # cloud.langfuse.com - free
LANGFUSE_PUBLIC_KEY=
LANGFUSE_BASEURL=          # defaults to https://cloud.langfuse.com
WORKFLOW_COST_CAP_USD=     # defaults to 0.10
WORKFLOW_STEP_TIMEOUT_MS=  # defaults to 30000
```

## Supabase migrations

Enable pgvector first:

```sql
create extension if not exists vector;
```

Then run, in order:

1. Core tables (`workflows`, `runs`, `run_steps`, `human_approvals`) - see `PRD.md`
2. Phase 3 tables (`workflow_embeddings`, `documents`, `document_chunks`, `workflow_runs`, `workflow_shares`) - see `PRD.md`
3. `evals/eval_runs.sql`

## Verifying your setup

```bash
npm run build         # must pass clean
npm test               # 89 tests, all offline - no API keys needed
npm run evals:mock    # 13 eval cases, zero API keys needed
```

If all three pass, your local environment is correctly configured.

## Project conventions

- No `any` types - use `unknown` with a type guard
- All API route bodies validated with Zod
- Server-side secrets never appear in any file with `'use client'`
- Tests are offline - mock all external calls (Groq, Tavily, Supabase, Hugging Face, Langfuse)

See `docs/ADDING_TOOLS.md` for how to extend the tool registry, node types, or eval suite.
