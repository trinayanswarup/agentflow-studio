# AGENTS.md — AgentFlow Studio Build Plan

## Overview
6 sessions. Each session has a clear goal, exact files to create, and a done condition (`npm run build` passes clean).

Commit before every session starts. Never skip the done condition.

---

## Session 1 — Execution Engine (no UI)

**Goal**: The agent loop works. Run a hardcoded workflow from the command line. No Next.js, no UI, no Supabase. Pure TypeScript.

**What to build**:
- `lib/types.ts` — all shared types (WorkflowNode, WorkflowEdge, WorkflowDefinition, ToolCall, TraceEvent, ExecutionContext)
- `lib/tools/registry.ts` — Tool interface + registry Map
- `lib/tools/web-fetch.ts` — fetch URL, strip HTML, return max 2000 chars
- `lib/tools/web-search.ts` — Tavily search, return top 5 results as text
- `lib/tools/extract-json.ts` — LLM extracts structured data from text
- `lib/tools/send-webhook.ts` — HTTP POST with JSON body
- `lib/tools/evaluate-output.ts` — LLM scores output 1-10 with reasoning
- `lib/llm/groq.ts` — Groq client, function calling loop (send → tool_call → execute → loop → until text)
- `lib/llm/gemini.ts` — Gemini fallback client, same interface
- `lib/engine/context.ts` — context object, template resolution (`{{nodeId_output}}`)
- `lib/engine/nodes/llm-call.ts`
- `lib/engine/nodes/tool-call.ts`
- `lib/engine/nodes/condition.ts`
- `lib/engine/nodes/human-pause.ts` (stub — just logs and continues in CLI mode)
- `lib/engine/nodes/output.ts`
- `lib/engine/runner.ts` — graph walker, emits trace events via EventEmitter
- `scripts/test-run.ts` — hardcoded lead enrichment workflow JSON, runs engine, prints trace events to console

**Install before starting**:
```powershell
npm install zod tsx
```

**Done condition**:
- `npx tsx scripts/test-run.ts` runs the lead enrichment workflow
- Console shows trace events: step_start, step_done, with latency and token counts
- `npm run build` passes clean

---

## Session 2 — SSE API + Raw Stream Page

**Goal**: The engine runs server-side. A browser page shows the raw SSE stream updating in real time.

**What to build**:
- `app/api/workflows/route.ts` — GET (list), POST (create) workflows in Supabase
- `app/api/run/route.ts` — POST to start a run, stores run in Supabase, returns run_id
- `app/api/stream/[runId]/route.ts` — GET returns SSE stream. Pulls workflow from Supabase, runs engine, emits trace events as SSE
- `lib/supabase/server.ts` — Supabase server client using service role key
- `lib/supabase/client.ts` — Supabase browser client using anon key
- `app/test-stream/page.tsx` — minimal page, hardcoded input form, connects to SSE stream, renders raw JSON events in a `<pre>` tag

**SSE format**:
```
data: {"type":"step_start","nodeId":"web_search","label":"Web Search"}\n\n
data: {"type":"step_done","nodeId":"web_search","output":"...","latencyMs":142,"tokens":0}\n\n
data: {"type":"run_complete","output":"..."}\n\n
data: {"type":"run_error","error":"..."}\n\n
```

**Done condition**:
- Open `/test-stream`, enter "Nord Security", click run
- SSE events appear in the `<pre>` block in real time
- Run and steps stored in Supabase
- `npm run build` passes clean

---

## Session 3 — Workflow Canvas (React Flow)

**Goal**: Users can build workflows visually. Canvas saves to Supabase.

**What to build**:
- Install `reactflow` package
- `components/canvas/WorkflowCanvas.tsx` — React Flow canvas, drag nodes from sidebar
- `components/canvas/NodeSidebar.tsx` — drag-and-drop palette of 6 node types
- `components/canvas/NodeConfigPanel.tsx` — right panel, click node to configure (prompt, tool name, condition expression, label)
- `components/canvas/nodes/` — custom React Flow node components for each of the 6 types
- `app/editor/page.tsx` — layout: sidebar (left) + canvas (center) + config panel (right) + Save button
- Save workflow: serialize React Flow nodes/edges to WorkflowDefinition JSON, POST to `/api/workflows`
- Pre-load the lead enrichment demo workflow on first visit via URL param `?demo=true`

**Node visual style**:
- `input` — blue border
- `llm_call` — purple border
- `tool_call` — orange border
- `condition` — yellow border, two output handles (true/false)
- `human_pause` — red border
- `output` — green border

**Done condition**:
- Load `/editor?demo=true` — lead enrichment workflow appears pre-built on canvas
- Add a new node, connect it, configure it, click Save
- Workflow saved in Supabase
- `npm run build` passes clean

---

## Session 4 — Live Trace Panel UI

**Goal**: The run page shows the canvas with nodes lighting up + live trace panel updating in real time.

**What to build**:
- `components/trace/TracePanel.tsx` — scrolling list of trace events. Each item: icon (✅⏳❌⏸), node label, status, latency, tokens, output preview (truncated at 100 chars)
- `components/trace/TraceItem.tsx` — single trace event row
- `hooks/useWorkflowExecution.ts` — connects to SSE stream, parses events, updates node execution state map and trace list
- `app/run/[id]/page.tsx` — left: React Flow canvas (read-only, nodes highlight based on execution state), right: TracePanel. Input form at top to enter workflow input and click Run.
- Node highlight states: yellow (running), green (done), red (error), blue (human_pause waiting)
- When run completes, show final output in a result box below the trace panel
- Link from editor Save → `/run/[workflowId]`

**Done condition**:
- Open `/run/[id]`, enter "Nord Security", click Run
- Canvas nodes light up one by one as they execute
- Trace panel updates in real time showing latency + tokens per step
- Final output appears when run completes
- `npm run build` passes clean

---

## Session 5 — Eval Runner

**Goal**: User can paste test cases, run all of them, see scored results.

**What to build**:
- `app/api/eval/route.ts` — POST with `{workflowId, testCases, scoringStrategy}`. Runs all cases concurrently (limit 3). Returns array of results.
- `components/eval/EvalResultsTable.tsx` — columns: input, expected, actual output, score (0-10), pass/fail, latency
- `components/eval/AggregateStats.tsx` — pass rate %, avg score, avg latency, total tokens
- `app/eval/page.tsx` — select workflow dropdown, scoring strategy selector (exact_match / contains / llm_judge), textarea for test cases JSON, Run Evals button, results table below
- Scoring:
  - `exact_match` — actual output === expected (case-insensitive trim)
  - `contains` — actual output includes expected string
  - `llm_judge` — Groq scores 0-10 with reasoning, pass if score >= 7
- Run history: each eval run stored as a run in Supabase with status `eval`

**Done condition**:
- Paste 3 test cases for lead enrichment workflow
- Click Run Evals — all 3 run concurrently
- Results table shows actual output, score, pass/fail per case
- Aggregate stats correct
- `npm run build` passes clean

---

## Session 6 — Human Pause UI + Landing Page + Deploy

**Goal**: Complete the project. Human approval works. Landing page exists. Deployed on Vercel.

**What to build**:

### Human pause
- `app/api/run/[runId]/approve/route.ts` — POST with `{action: 'approve' | 'reject', editedOutput?: string}`. Updates run status in Supabase. Signals the waiting execution.
- `components/approval/HumanApprovalCard.tsx` — shows current output, textarea for editing, three buttons: Approve / Edit+Continue / Reject
- In `app/run/[id]/page.tsx` — when SSE emits `human_pause` event, show HumanApprovalCard inline in trace panel
- Engine: `human-pause.ts` polls Supabase every 2s for approval decision (max 5 min timeout)

### Landing page
- `app/page.tsx` — project title, one-paragraph description, two things it proves (agent infrastructure, eval framework), Demo button (→ `/editor?demo=true`), GitHub link, tech stack badges

### Deploy
- Add all env vars to Vercel project settings
- Confirm `npm run build` passes clean
- Deploy to Vercel, verify SSE stream works in production
- Test full lead enrichment demo on production URL

**Done condition**:
- Run lead enrichment workflow end-to-end on production URL
- Human pause appears, approve works, workflow continues
- Landing page loads with Demo button working
- All 4 screens functional
- `npm run build` passes clean on Vercel

---

## Restore points
Before each session, run:
```powershell
git add .
git commit -m "restore: before session X"
```
If a session goes wrong, `git reset --hard HEAD` to restore.
