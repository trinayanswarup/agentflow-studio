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
| Company | Location | Why AgentFlow fits |
|---|---|---|
| Fixxer | Remote | Explicitly wants Claude Code, MCP, agentic orchestration |
| Enpal | Berlin | Agents in production, needs trace debugging + tool fix skills |
| 10Clouds | Warsaw | Builds lead qualification workflows for financial clients |
| AI Opener | Amsterdam | Wants eval frameworks, tool design, agent orchestration |
| CybelAngel | Paris | Lists Claude Code + rapid AI automation prototyping |

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

| Node | Description |
|---|---|
| `input` | Entry point, receives user string |
| `llm_call` | Sends prompt to LLM with tool calling enabled, loops until text response |
| `tool_call` | Directly calls a specific tool without LLM decision |
| `condition` | Evaluates JS expression against context, takes true/false branch |
| `human_pause` | Stops execution, shows output in UI, waits for approve/reject/edit |
| `output` | End point, returns final result |

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

| Tool | Description |
|---|---|
| `web_fetch` | Fetches a URL, returns cleaned text, max 2000 chars |
| `web_search` | Tavily API — top 5 results, agent-optimized output |
| `extract_json` | Given text + schema, asks LLM to extract structured data |
| `send_webhook` | HTTP POST to any URL with JSON body |
| `evaluate_output` | Given output + rubric, LLM scores it 1–10 with reasoning |

### Tool interface
```typescript
interface Tool {
  name: string
  description: string
  input_schema: JSONSchema
  execute(input: Record<string, unknown>): Promise<string>
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
| Layer | Tech |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind, React Flow |
| Execution | TypeScript execution engine, Groq SDK |
| LLM primary | Groq llama-3.3-70b-versatile (function calling) |
| LLM fallback | Gemini 1.5 Flash (long context) |
| Search | Tavily API — only provider (free, 1000 req/month) |
| Validation | Zod — tool inputs + API route bodies |
| Scripts | tsx — run TypeScript directly |
| Database | Supabase free tier |
| Deploy | Vercel |

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

## Build sessions — 6 sessions
| Session | Focus |
|---|---|
| 1 | Execution engine in pure TypeScript, no UI, hardcoded workflow JSON, CLI run |
| 2 | SSE API route + minimal Next.js page showing raw stream |
| 3 | Workflow canvas with React Flow |
| 4 | Live trace panel UI |
| 5 | Eval runner |
| 6 | Human-pause UI, landing page, deploy |

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
