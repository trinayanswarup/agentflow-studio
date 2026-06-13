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

# Phase 2 — Templates, more workflows, UX, polish

Phase 1 (Sessions 1–6) is complete and verified: engine, SSE, canvas, trace panel, eval runner, human-pause all work live. Phase 2 turns a working engine into a product that's obvious to use and reads like the job descriptions.

Vocabulary change for all of Phase 2: the word **"demo" is replaced with "template" or "workflow"** everywhere in code, UI, and routes. A user loads a _template_; the thing they build and run is a _workflow_.

---

## Session 7 — Templates system + gallery

**Goal**: The pre-built workflows become a browsable library a user loads with one click. Replaces the single `?demo=true` query param.

**What to build**:

- `lib/templates/index.ts` — a typed registry of templates. Each template is `{ id, name, description, category, definition }` where `definition` is a full WorkflowDefinition (nodes + edges, fully configured).
- Move the existing Lead Qualification workflow definition out of `WorkflowCanvas.tsx` into `lib/templates/lead-qualification.ts`.
- Add `lib/templates/hello.ts` — the starter: `input → llm_call → output`, llm_call prompt "Answer the user's question: {{input_1_output}}". No tools, no search. Runs in ~2s.
- `app/templates/page.tsx` — gallery page: grid of template cards (name, description, category badge, node count). Each card has a "Use this template" button.
- "Use this template" → loads that template's definition into the editor (`/editor?template=<id>`).
- Update `app/editor/page.tsx` — read `?template=<id>`, look it up in the registry, pre-load its definition. Keep `?demo=true` working as an alias for the lead-qualification template so old links don't break.
- Landing page "Try the Demo" button → rename to "Browse Templates", points to `/templates`.
- Rename any user-facing "demo" string to "template"/"workflow".

**Done condition**:

- `/templates` shows a gallery with Hello + Lead Qualification cards
- Clicking "Use this template" loads it into the editor, fully configured, ready to run
- `npm run build` passes clean

---

## Session 8 — Loop support + two new workflows

**Goal**: Add minimal loop capability to the engine, then ship two new templates that show branching and self-correction.

**Part A — Loop engine support**:

- The engine currently walks the graph forward only. Add bounded back-edges: an edge may point to an already-visited node, and the runner follows it, but with a hard **max-iterations guard per node** (default 3) to prevent infinite loops.
- `lib/engine/runner.ts` — track a visit count per nodeId. If a node is entered more than its max-iterations, emit a `loop_limit` trace event and route to the node's normal forward path instead of looping again.
- Add `lib/types.ts` — `loop_limit` trace event type.
- A `condition` node whose `true`/`false` branch points back upstream is how a loop is expressed — no new node type needed.

**Part B — CyberOps Domain Risk Check template** (`lib/templates/domain-risk.ts`):

- `input (domain)` → `web_search` (query: "{{input_1_output}} data breach security incident") → `llm_call` (extract risk signals → JSON: exposure, known_breaches, reputation_notes) → `tool_call evaluate_output` (criteria: "Rate cybersecurity risk 1-10 based on these signals") → `condition` (`{{score_1_output}}` contains a number ≥ 7) → true branch: `human_pause` (analyst review) → `output`; false branch: straight to `output`.

**Part C — Self-Correcting Research Agent template** (`lib/templates/research-agent.ts`):

- `input (topic)` → `web_search` → `llm_call` (write research brief) → `tool_call evaluate_output` (criteria: "Rate this brief's completeness 1-10") → `condition` (`{{quality_1_output}}` score < 7) → true branch (low score): loop back to `web_search` with a refined query → false branch (good): `output`. The loop guard caps retries at 3.

**Both templates registered in `lib/templates/index.ts`.**

**Done condition**:

- Domain Risk template: running a high-risk domain branches to human_pause; a low-risk one skips it — verified live in `/run`
- Research Agent template: a deliberately thin first result triggers at least one retry loop, visible in the trace, and stops within 3 iterations
- `npm run build` passes clean

---

## Session 9 — UX clarity pass

**Goal**: Remove every point where a new user (or the builder) gets confused about how it works.

**What to build**:

- `components/canvas/NodeStateLegend.tsx` — a small fixed legend on the run page: ● yellow running, ● green done, ● red error, ● blue waiting for you.
- Editor empty state — when the canvas has zero nodes, show centered helper text: "Drag a node from the left to start — or load a template" with a button to `/templates`.
- Connection-rule hints — on the condition node, label the two output handles visibly ("true" / "false") on the canvas itself, not just in config. When a user starts dragging a connection, valid target handles highlight.
- `app/how-it-works/page.tsx` — a static walkthrough page: what a node is, how to connect them, what each node type does (table), how `{{slug_output}}` references work, how to run. Screenshots or simple inline SVG diagrams. Linked from the landing page and the editor.
- Config panel: when a node is selected, show a one-line description of what that node type does at the top of the panel.

**Done condition**:

- Run page shows the state legend
- Empty editor shows guidance, not a blank void
- Condition node shows true/false labels on canvas
- `/how-it-works` page exists and is linked from landing + editor
- `npm run build` passes clean

---

## Session 10 — Visual design pass

**Goal**: Make it look intentionally designed, not default Tailwind. READ THE frontend-design SKILL FIRST.

**What to build**:

- Read `/mnt/skills/public/frontend-design/SKILL.md` before any styling. Follow its design-token guidance.
- Establish a small design system: one accent color, a neutral scale, consistent type scale (heading/body/mono), consistent spacing and border-radius, applied via Tailwind config or CSS variables. No ad-hoc per-component colors.
- Landing page redesign — above the fold, show the product _working_: an embedded screenshot or looping image of the canvas + live trace panel mid-run. Headline that says what it does in one line. Clear primary CTA (Browse Templates) and secondary (How it works / GitHub).
- Apply the design system across: templates gallery, editor chrome, run page, eval page. Trace panel gets special attention — it's the star surface (clear step names, legible latency/token chips, distinct human-approval card).
- Keep the dark theme; make it deliberate.

**Done condition**:

- Consistent type scale, spacing, and accent color across all pages (no default-Tailwind look)
- Landing page shows a running workflow above the fold
- Trace panel is clearly the most polished surface
- `npm run build` passes clean

---

## Session 11 — README rewrite

**Goal**: The README is the application. It must read like engineering documentation, not a product blurb.

**What to write** (in README.md):

- One-line what-it-is + a hero screenshot of the trace panel running.
- **Architecture** — a diagram and prose: Next.js + React Flow → SSE API routes → TypeScript execution engine (graph runner + context + tool registry) → Groq function-calling (Gemini fallback) → Supabase. Explain _why_ each choice (why SSE over WebSockets, why Groq, why polling vs realtime for human-pause).
- **Failure modes and how the system handles them** — Groq down, Tavily rate-limited, user closes tab mid-run, a tool call fails validation. One short paragraph each.
- **War stories** (these are real, from the build): (1) the Zod schema is the single source of truth — JSON Schema for function-calling is auto-derived via `z.toJSONSchema`, so validation and tool-calling can never drift; (2) the `tool_use_failed` retry — llama-3.3 invents fake tool names to format its final answer; the agent loop catches Groq's 400 and retries the same conversation without tools.
- **How to add a new tool** — ~10-line code example using the Tool interface.
- **How to add a new node type** — short example.
- **Templates** — list the four shipped workflows and what each demonstrates.
- **Local setup** — prerequisites, env vars, Supabase migrations, `npm run dev`.

**Done condition**:

- README has architecture rationale, failure modes, both war stories, and both "how to add" examples
- A hero screenshot is embedded
- No marketing fluff — reads like an engineer wrote it

---

## Session 12 — Interactive guided overlay + deploy

**Goal**: First-run guidance, then ship it.

**Part A — Guided overlay**:

- `components/onboarding/GuidedTour.tsx` — first time a user opens `/editor` (track with in-memory/React state, NOT localStorage — localStorage is unavailable in this environment), show a sequence of tooltips pointing at: the node sidebar ("drag from here"), a node ("click to configure"), the Run button ("run it"), the trace panel ("watch each step"). Skippable. A "Show me" button on the landing page triggers it too.
- Pairs with the static `/how-it-works` page from Session 9 — the page explains, the overlay walks through live.

**Part B — Deploy**:

- `npm run build` must pass clean.
- Deploy to Vercel (Hobby/free tier).
- Note: human-pause needs `maxDuration` > 10s, which Hobby caps. So the deployed demo covers editor, templates, eval, and no-pause runs. The human-pause is shown via a recorded local GIF in the README.
- Record short GIFs (ScreenToGif, free) of: a workflow running with live trace, the human-pause approve flow, the eval runner. Add to README.

**Done condition**:

- Guided overlay walks a first-time user through the editor, skippable
- App deployed and reachable on a public Vercel URL
- README has GIFs of the trace, the human-pause, and the eval runner
- `npm run build` passes clean

---

## Restore points

Before each session, run:

```powershell
git add .
git commit -m "restore: before session X"
```

If a session goes wrong, `git reset --hard HEAD` to restore.
