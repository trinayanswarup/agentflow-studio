# AgentFlow Studio

A visual AI workflow builder with a live execution engine. Build automations by connecting nodes on a canvas — each node is a step: call an LLM, call a tool, check a condition, wait for human approval, or return output. When a workflow runs, the execution engine walks the graph, streams live trace events to the browser, and stores every run for evaluation.

**[Live Demo](https://agentflow-studio.vercel.app)** · **[Demo Workflow: Lead Enrichment Pipeline](#demo-workflow)**

---

## What this proves

- **Agent infrastructure** — built the graph runner, tool registry, and LLM agent loop from scratch. Not a wrapper around an existing agent framework.
- **Observability** — every step emits trace events over SSE. Latency, token count, and output visible in real time as the workflow executes.
- **Human-in-the-loop** — workflow pauses at approval nodes. User can approve, edit the output, or reject. Execution continues with the edited version as context.
- **Eval framework** — run test cases against any workflow, score with exact match, contains, or LLM judge. Edit prompts, re-run, see if score improved.

---

## Demo workflow — Lead Enrichment Pipeline

Input: a company name (e.g. "Nord Security")

```
Input: "Nord Security"
    ↓
web_search — find company overview on LinkedIn / Crunchbase
    ↓
web_fetch — fetch top result page
    ↓
llm_call — extract: name, industry, size, product, description → JSON
    ↓
llm_call — write personalised cold outreach email (max 150 words)
    ↓
human_pause — review draft email → approve / edit / reject
    ↓
Output: final email + company profile JSON
```

Runtime: ~40 seconds. Produces a real personalised email for any company name.

---

## Architecture

```
Next.js 14 + React Flow (canvas)
        ↓
Next.js API routes + SSE stream
        ↓
Execution Engine (TypeScript)
  Graph runner → context store → tool registry
        ↓
Groq llama-3.3-70b-versatile (function calling)
Gemini 1.5 Flash (long context fallback)
        ↓
Supabase (workflows, runs, run steps)
        ↓
SSE → live trace panel in browser
```

---

## Node types

| Node | Description |
|---|---|
| `input` | Entry point — receives user string |
| `llm_call` | LLM with tool calling enabled — loops until text response |
| `tool_call` | Directly calls a tool without LLM decision |
| `condition` | JS expression against context — true or false branch |
| `human_pause` | Pauses execution — approve / edit / reject |
| `output` | End point — returns final result |

---

## Tool registry

| Tool | Description |
|---|---|
| `web_fetch` | Fetches URL, strips HTML, returns max 2000 chars |
| `web_search` | Tavily API — top 5 agent-optimized results |
| `extract_json` | LLM extracts structured data from text |
| `send_webhook` | HTTP POST to any URL with JSON body |
| `evaluate_output` | LLM scores output 1–10 with reasoning |

---

## Tech stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, React Flow
- **Execution engine**: TypeScript, server-side API routes
- **LLM**: Groq llama-3.3-70b-versatile (primary), Gemini 1.5 Flash (fallback)
- **Search**: Tavily API (only search provider)
- **Validation**: Zod
- **Database**: Supabase (PostgreSQL)
- **Deploy**: Vercel

---

## Local setup

### Prerequisites
- Node.js 18+
- Supabase project (free tier)
- Groq API key (free at groq.com)
- Gemini API key (free at aistudio.google.com)
- Tavily API key (free at tavily.com)

### Steps

```powershell
git clone https://github.com/trinayanswarup/agentflow-studio
cd agentflow-studio
npm install
```

Copy `.env.example` to `.env.local` and fill in your keys:

```
GROQ_API_KEY=
GEMINI_API_KEY=
TAVILY_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Run the Supabase SQL migrations in `supabase/migrations/`.

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Screens

1. **Landing** — project overview, demo button
2. **Editor** — React Flow canvas, drag nodes, configure, save
3. **Run** — live trace panel + canvas node highlighting via SSE
4. **Eval** — test cases runner, scored results table

---

## Built by

Trinayan — Computer Engineering student at Vilnius Tech, building AI-native portfolio projects.  
GitHub: [github.com/trinayanswarup](https://github.com/trinayanswarup)
