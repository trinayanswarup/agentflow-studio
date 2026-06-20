# AgentFlow Studio — Product Requirements Document

## One-sentence pitch

AgentFlow Studio lets users visually build AI automations — each box is a step: call an LLM, call a tool, check a condition, wait for human approval, or return output — and when a workflow runs, the execution engine walks the graph, passes context between steps, streams live trace events to the frontend, handles errors, and stores each run for evaluation.

---

## Goal

Build an internship portfolio weapon that proves you built AI infrastructure — not a ChatGPT wrapper. This project demonstrates agent workflows, tool calling, orchestration, live tracing, evals, human-in-the-loop, and failure handling.

---

## What this is NOT

- No login, no teams, no billing, no permissions
- No marketplace, no mobile perfection, no 100 tools
- Goal: internship weapon, not SaaS product

---

## Target companies

| Company    | Location  | Why AgentFlow fits                                            |
| ---------- | --------- | ------------------------------------------------------------- |
| Fixxer     | Remote    | Explicitly wants Claude Code, MCP, agentic orchestration      |
| Enpal      | Berlin    | Agents in production, needs trace debugging + tool fix skills |
| 10Clouds   | Warsaw    | Builds lead qualification workflows for financial clients     |
| AI Opener  | Amsterdam | Wants eval frameworks, tool design, agent orchestration       |
| CybelAngel | Paris     | Lists Claude Code + rapid AI automation prototyping           |

---

## Architecture

```
Next.js + React Flow (canvas)
        ↓
Next.js API routes + SSE stream
        ↓
Execution Engine — TypeScript
Graph runner + context store + tool registry
        ↓
Groq SDK — llama-3.3-70b-versatile (tool/function calling)
Gemini 1.5 Flash — fallback for long context
        ↓
Supabase (run history)
        ↓
SSE → live trace panel in browser
```

---

## Node types — exactly 6

| Node          | Description                                                              |
| ------------- | ------------------------------------------------------------------------ |
| `input`       | Entry point, receives user string                                        |
| `llm_call`    | Sends prompt to LLM with tool calling enabled, loops until text response |
| `tool_call`   | Directly calls a specific tool without LLM decision                      |
| `condition`   | Evaluates JS expression against context, takes true/false branch         |
| `human_pause` | Stops execution, shows output in UI, waits for approve/reject/edit       |
| `output`      | End point, returns final result                                          |

### Node config shape

```json
{
  "id": "extract_company",
  "type": "llm_call",
  "label": "Extract Company Profile",
  "prompt": "Extract company name, industry, size and description from: {{web_fetch_output}}"
}
```

---

## Tool registry — exactly 5 tools

| Tool              | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `web_fetch`       | Fetches a URL, returns cleaned text, max 2000 chars      |
| `web_search`      | Tavily API — top 5 results, agent-optimized output       |
| `extract_json`    | Given text + schema, asks LLM to extract structured data |
| `send_webhook`    | HTTP POST to any URL with JSON body                      |
| `evaluate_output` | Given output + rubric, LLM scores it 1–10 with reasoning |

### Tool interface

```typescript
interface Tool {
  name: string;
  description: string;
  input_schema: JSONSchema;
  execute(input: Record<string, unknown>): Promise<string>;
}
```

---

## Screens — exactly 4

### 1. Landing page

- Explain the project
- Demo button → pre-loads lead enrichment workflow
- Link to GitHub

### 2. Workflow editor

- React Flow canvas
- Sidebar: drag node types onto canvas
- Click node → right panel config
- Save workflow button

### 3. Run page

- Left: workflow canvas, nodes light green/red as they execute
- Right: live trace timeline via SSE
- Human approval UI appears inline on pause

### 4. Eval page

- Textarea for test cases JSON
- Run button
- Results table: input / expected / actual / score / pass/fail
- Aggregate stats: pass rate, avg score, avg latency, total tokens

---

## Live trace panel format

```
✅ Input received — "Nord Security"
✅ Web search completed — 3 results found (142ms, 0 tokens)
✅ Page fetched — nordvpn.com/about (89ms, 0 tokens)
✅ Company profile extracted (1.2s, 312 tokens)
   → { name: "Nord Security", industry: "cybersecurity"... }
✅ Cold email generated (2.1s, 489 tokens)
   → "Hi [Name], I noticed Nord Security recently expanded..."
⏸  Waiting for human approval
```

Each trace item: node name, status, latency, tokens used, output preview, error if failed.

---

## Human approval flow

1. Workflow pauses at `human_pause` node
2. UI shows current output with three buttons: **Approve / Edit / Reject**
3. Approve → workflow continues
4. Edit → user edits output, workflow continues with edited version as context
5. Reject → workflow stops, run marked failed

---

## Eval framework

```json
[
  { "input": "Nord Security", "expected": "cybersecurity" },
  { "input": "Revolut", "expected": "fintech" },
  { "input": "Spotify", "expected": "music streaming" }
]
```

- Runs all cases concurrently (limit: 3)
- Scoring strategies: `exact_match`, `contains`, `llm_judge`
- Results table + aggregate stats
- Edit prompt → re-run → see if score improved

---

## Supabase tables — exactly 3

```sql
workflows: id, name, definition_json, created_at
runs: id, workflow_id, input, status, created_at, completed_at
run_steps: id, run_id, node_id, node_label, status, output,
           error, latency_ms, tokens_used, created_at
```

---

## Demo workflow — Lead Enrichment Pipeline

```
Input: company name (e.g. "Nord Security")
    ↓
web_search: "{input} company overview site:linkedin.com OR crunchbase.com"
    ↓
web_fetch: top result URL
    ↓
llm_call: Extract company profile → structured JSON
    ↓
llm_call: Write personalised cold outreach email (max 150 words)
    ↓
human_pause: shows draft email → user approves or edits
    ↓
Output: final email + company profile JSON
```

Runtime: ~40 seconds. Produces a real personalised email for any company name. This is the interview demo.

---

## Tech stack

| Layer        | Tech                                              |
| ------------ | ------------------------------------------------- |
| Frontend     | Next.js 14, TypeScript, Tailwind, React Flow      |
| Execution    | TypeScript execution engine, Groq SDK             |
| LLM primary  | Groq llama-3.3-70b-versatile (function calling)   |
| LLM fallback | Gemini 1.5 Flash (long context)                   |
| Search       | Tavily API — only provider (free, 1000 req/month) |
| Validation   | Zod — tool inputs + API route bodies              |
| Scripts      | tsx — run TypeScript directly                     |
| Database     | Supabase free tier                                |
| Deploy       | Vercel                                            |

---

## Environment variables

```
GROQ_API_KEY          # groq.com — free
GEMINI_API_KEY        # aistudio.google.com — free
TAVILY_API_KEY        # tavily.com — free, 1000 req/month
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # server-side only, never exposed
```

---

## Build sessions

### Phase 1 — Core engine + UI (COMPLETE)

| Session | Focus                                                                        | Status  |
| ------- | ---------------------------------------------------------------------------- | ------- |
| 1       | Execution engine in pure TypeScript, no UI, hardcoded workflow JSON, CLI run | ✅ done |
| 2       | SSE API route + minimal Next.js page showing raw stream                      | ✅ done |
| 3       | Workflow canvas with React Flow                                              | ✅ done |
| 4       | Live trace panel UI                                                          | ✅ done |
| 5       | Eval runner                                                                  | ✅ done |
| 6       | Human-pause UI, landing page                                                 | ✅ done |

### Phase 2 — Templates, more workflows, UX, polish

| Session | Focus                                                                                                              | Status |
| ------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| 7       | Templates system + gallery (rename demo→template throughout)                                                       | ⬜     |
| 8       | Loop engine support + two new workflows (CyberOps domain-risk, self-correcting research)                           | ⬜     |
| 9       | UX clarity pass (node-state legend, empty states, connection-rule hints, "How it works" page)                      | ⬜     |
| 10      | Visual design pass (frontend-design skill: typography, spacing, color, landing page that shows a running workflow) | ⬜     |
| 11      | README rewrite (architecture decisions, war stories, failure modes, how to add a node)                             | ⬜     |
| 12      | Interactive guided overlay + deploy + record GIFs                                                                  | ⬜     |

### Templates that ship with the product

- **Hello (starter)** — `input → llm_call → output`. The 5-second first-run so a new user sees something work immediately.
- **Lead Qualification** — `input → web_search → llm_call (extract) → tool_call (evaluate_output) → human_pause → output`. Sales/lead-gen (10Clouds, AI Opener).
- **CyberOps Domain Risk Check** — `input (domain) → web_search → llm_call (extract risk signals) → tool_call (evaluate_output, risk score) → condition (score ≥ 7?) → high-risk: human_pause (analyst review); low-risk: skip → output`. Security (CybelAngel, Mediatech). Shows condition branching.
- **Self-Correcting Research Agent** — `input (topic) → web_search → llm_call (write brief) → tool_call (evaluate_output, quality score) → condition (score < 7?) → if low: loop back to web_search with refined query and retry; if good: → output`. Shows eval + loop + retry working together.

### Connection rules (surfaced in the UI)

- `input` has one output, no input.
- `output` has one input, no output.
- `condition` has one input and TWO outputs: `true` and `false`.
- `human_pause` has one input, one output.
- `llm_call` / `tool_call` have one input, one output.
- A node's output may be referenced anywhere downstream via `{{slug_output}}` (readable) or `{{nodeId_output}}` (UUID); both resolve.

---

## Success criteria

- [ ] Lead enrichment demo runs end-to-end in ~40s
- [ ] Live trace panel updates in real time
- [ ] Human approval pause works (approve/edit/reject)
- [ ] Eval runner scores at least 3 test cases with llm_judge
- [ ] Run history stored in Supabase
- [ ] `npm run build` passes clean
- [ ] Deployed on Vercel
- [ ] No API keys or secrets visible in the UI or client-side code

---

## Phase 3 — Expansion

### Sessions

| Session | Focus                                         | Status |
| ------- | --------------------------------------------- | ------ |
| 13      | JSON Export + Shareable Links                 | ⬜     |
| 14      | Analytics Dashboard (Workflow Insights)       | ⬜     |
| 15      | RAG Infrastructure + Semantic Workflow Search | ⬜     |
| 16      | Document Upload + Q&A                         | ⬜     |
| 17      | PDF → Workflow Import                         | ⬜     |
| 18      | Tests + Polish + Deploy                       | ⬜     |

### New pages

- `/analytics` — Workflow Insights dashboard
- `/documents` — Document upload + Q&A split panel + workflow import
- `/share/[slug]` — Public read-only workflow canvas

### New tables (run SQL in Supabase before Session 13)

```sql
create extension if not exists vector;

create table workflow_embeddings (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  embedding vector(384) not null,
  content text not null,
  created_at timestamptz default now()
);
create index on workflow_embeddings using ivfflat (embedding vector_cosine_ops);

create table documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  filetype text not null,
  uploaded_at timestamptz default now()
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(384) not null,
  created_at timestamptz default now()
);
create index on document_chunks using ivfflat (embedding vector_cosine_ops);

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text not null,
  failed_step text
);

create table workflow_shares (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  slug text unique not null,
  is_public boolean default true,
  created_at timestamptz default now()
);
```

### New env var

```
HUGGINGFACE_API_KEY=    # huggingface.co → Settings → Access Tokens → free
NEXT_PUBLIC_BASE_URL=   # e.g. http://localhost:3000 locally, your Vercel URL in production
```

### New packages

```
npm install pdf-parse mammoth nanoid @types/pdf-parse
```

### Phase 3 success criteria

- [ ] Export button downloads valid workflow JSON
- [ ] Share link opens read-only canvas
- [ ] /analytics shows real run data with charts
- [ ] Document upload + Q&A works for PDF and DOCX
- [ ] PDF → workflow import generates a valid canvas workflow
- [ ] Semantic search returns relevant results ranked by similarity
- [ ] All Phase 3 tests pass, existing 50 tests still pass
- [ ] Deployed on Vercel with all new env vars set
