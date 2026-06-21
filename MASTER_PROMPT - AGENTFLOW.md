# MASTER_PROMPT.md — Claude Code Session Prompts

Copy the relevant session prompt at the start of each Claude Code session.
Do not modify the prompt — use it exactly as written.

---

## Session 1 — Execution Engine

```
Read CLAUDE.md and AGENTS.md fully before writing any code.

We are building Session 1 of AgentFlow Studio: the execution engine in pure TypeScript with no UI.

Stack: Next.js 14, TypeScript, Tailwind, Groq SDK, Tavily API, Supabase, Zod.
LLM: Groq llama-3.3-70b-versatile with function calling. Gemini 1.5 Flash as fallback.
Search: Tavily API only (TAVILY_API_KEY). No DuckDuckGo, no Brave.
Validation: Zod for all tool inputs and API route bodies.
Scripts: use tsx to run TypeScript directly (npx tsx).

Build exactly these files in this order:
1. lib/types.ts — all shared types
2. lib/tools/registry.ts — Tool interface + Map registry
3. lib/tools/web-fetch.ts
4. lib/tools/web-search.ts (Tavily)
5. lib/tools/extract-json.ts
6. lib/tools/send-webhook.ts
7. lib/tools/evaluate-output.ts
8. lib/llm/groq.ts — function calling agent loop
9. lib/llm/gemini.ts — fallback, same interface
10. lib/engine/context.ts — context object + {{template}} resolution
11. lib/engine/nodes/llm-call.ts
12. lib/engine/nodes/tool-call.ts
13. lib/engine/nodes/condition.ts
14. lib/engine/nodes/human-pause.ts (stub for now)
15. lib/engine/nodes/output.ts
16. lib/engine/runner.ts — graph walker with EventEmitter trace events
17. scripts/test-run.ts — hardcoded lead enrichment workflow, CLI runner

Rules:
- No any types. Use unknown + type guards.
- No secrets in any client-side file.
- Use Zod to validate all tool inputs before calling execute().
- npm run build must pass clean at the end.

Done condition: npx tsx scripts/test-run.ts runs the lead enrichment workflow and prints trace events to console with latency and token counts.
```

---

## Session 2 — SSE API + Raw Stream Page

```
Read CLAUDE.md and AGENTS.md fully before writing any code.

We are building Session 2 of AgentFlow Studio: SSE API routes and a minimal stream test page.

Session 1 is complete. The execution engine is in lib/engine/ and lib/tools/.

Build exactly these files:
1. lib/supabase/server.ts — server client with service role key
2. lib/supabase/client.ts — browser client with anon key
3. app/api/workflows/route.ts — GET list, POST create
4. app/api/run/route.ts — POST start run, return run_id
5. app/api/stream/[runId]/route.ts — GET SSE stream
6. app/test-stream/page.tsx — minimal test page

SSE format:
data: {"type":"step_start","nodeId":"...","label":"..."}\n\n
data: {"type":"step_done","nodeId":"...","output":"...","latencyMs":0,"tokens":0}\n\n
data: {"type":"human_pause","nodeId":"...","output":"..."}\n\n
data: {"type":"run_complete","output":"..."}\n\n
data: {"type":"run_error","error":"..."}\n\n

Rules:
- SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, GEMINI_API_KEY, TAVILY_API_KEY are server-side only.
- Only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in client files.
- npm run build must pass clean at the end.

Done condition: /test-stream page connects to SSE, enters "Nord Security", events appear in real time, run stored in Supabase.
```

---

## Session 3 — Workflow Canvas

```
Read CLAUDE.md and AGENTS.md fully before writing any code.

We are building Session 3 of AgentFlow Studio: the React Flow workflow editor.

Sessions 1 and 2 are complete. Engine and SSE API are working.

Install reactflow if not already installed.

Build exactly these files:
1. components/canvas/nodes/ — custom node components for all 6 types
2. components/canvas/NodeSidebar.tsx — drag palette
3. components/canvas/NodeConfigPanel.tsx — right panel config
4. components/canvas/WorkflowCanvas.tsx — main canvas
5. app/editor/page.tsx — full editor layout

Node border colors: input=blue, llm_call=purple, tool_call=orange, condition=yellow, human_pause=red, output=green.

Condition node must have two output handles labeled "true" and "false".

On load with ?demo=true query param, pre-load the lead enrichment workflow:
- Nodes: input → web_search → web_fetch → llm_call(extract) → llm_call(email) → human_pause → output
- Configure each node with the correct prompts from PRD.md

Save button: serialize React Flow state to WorkflowDefinition JSON, POST to /api/workflows.

Rules:
- No any types.
- npm run build must pass clean at the end.

Done condition: /editor?demo=true shows lead enrichment workflow on canvas. Can add nodes, connect them, configure them, save to Supabase.
```

---

## Session 4 — Live Trace Panel

```
Read CLAUDE.md and AGENTS.md fully before writing any code.

We are building Session 4 of AgentFlow Studio: the run page with live trace panel.

Sessions 1-3 are complete. Engine, SSE API, and canvas are working.

Build exactly these files:
1. hooks/useWorkflowExecution.ts — SSE connection, node state map, trace list
2. components/trace/TraceItem.tsx — single trace event row
3. components/trace/TracePanel.tsx — scrolling list
4. app/run/[id]/page.tsx — full run page

Run page layout:
- Top: input form (text input + Run button)
- Left panel: React Flow canvas, read-only, nodes highlight by execution state
- Right panel: TracePanel with live events

Node highlight: yellow=running, green=done, red=error, blue=human_pause.

Each trace item shows: icon, node label, status, latency ms, token count, output preview (max 100 chars, truncated with ...).

When run_complete event received: show final output in a result box below trace panel.

Link Save button in editor to /run/[workflowId] after saving.

Rules:
- No any types.
- npm run build must pass clean at the end.

Done condition: /run/[id] with "Nord Security" input — canvas nodes light up, trace panel updates in real time, final output appears.
```

---

## Session 5 — Eval Runner

```
Read CLAUDE.md and AGENTS.md fully before writing any code.

We are building Session 5 of AgentFlow Studio: the eval runner.

Sessions 1-4 are complete.

Build exactly these files:
1. app/api/eval/route.ts — POST eval runner, concurrency limit 3
2. components/eval/EvalResultsTable.tsx
3. components/eval/AggregateStats.tsx
4. app/eval/page.tsx

Scoring strategies:
- exact_match: actual.toLowerCase().trim() === expected.toLowerCase().trim()
- contains: actual.toLowerCase().includes(expected.toLowerCase())
- llm_judge: Groq scores 0-10 with reasoning, pass if score >= 7

Test cases JSON format:
[{"input": "Nord Security", "expected": "cybersecurity"}]

Results table columns: input | expected | actual output | score | pass/fail | latency ms
Aggregate stats: pass rate % | avg score | avg latency | total tokens

Rules:
- No any types.
- npm run build must pass clean at the end.

Done condition: paste 3 test cases, click Run Evals, all 3 run concurrently, results table correct, aggregate stats correct.
```

---

## Session 6 — Human Pause + Landing Page + Deploy

```
Read CLAUDE.md and AGENTS.md fully before writing any code.

We are building Session 6 of AgentFlow Studio: human approval UI, landing page, and Vercel deployment.

Sessions 1-5 are complete.

Build exactly these files:
1. app/api/run/[runId]/approve/route.ts — POST approve/reject endpoint
2. components/approval/HumanApprovalCard.tsx — output display + approve/edit/reject buttons
3. Update app/run/[id]/page.tsx — show HumanApprovalCard when human_pause SSE event received
4. Update lib/engine/nodes/human-pause.ts — poll Supabase every 2s for decision, 5 min timeout
5. app/page.tsx — landing page

Landing page must have:
- Project title: "AgentFlow Studio"
- One paragraph: what it is
- What it proves (2 bullet points)
- Demo button → /editor?demo=true
- GitHub link → https://github.com/trinayanswarup/agentflow-studio
- Tech stack badges (Next.js, TypeScript, React Flow, Groq, Supabase)

After building: add all env vars to Vercel, deploy, test full lead enrichment demo on production URL.

Rules:
- No API keys or secrets in any client-side code or visible in the UI.
- No any types.
- npm run build must pass clean at the end.

Done condition: production URL runs lead enrichment demo end-to-end. Human pause appears. Approve works. All 4 screens functional.
```

---

# Phase 2 — Templates, more workflows, UX, polish

Phase 1 (Sessions 1–6) is complete. These build a working engine into a usable, well-designed product. Commit before each session.

Vocabulary: across all of Phase 2, replace the word "demo" with "template" or "workflow" in code, UI, and routes.

---

## Session 7 — Templates system + gallery

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 7 of AgentFlow Studio: a templates system and gallery.
Sessions 1–6 are complete. The engine, canvas, trace panel, eval, and human-pause all work.

Across this session, replace the user-facing word "demo" with "template" or "workflow".

Build exactly these files:
1. lib/templates/index.ts — typed registry. Each template: { id, name, description, category, definition } where definition is a full WorkflowDefinition (nodes + edges, fully configured).
2. lib/templates/lead-qualification.ts — move the existing Lead Qualification workflow definition here, out of WorkflowCanvas.tsx.
3. lib/templates/hello.ts — starter template: input → llm_call → output. The llm_call prompt is "Answer the user's question: {{input_1_output}}". No tools, no search.
4. app/templates/page.tsx — gallery: grid of template cards (name, description, category badge, node count) with a "Use this template" button each.
5. Update app/editor/page.tsx — read ?template=<id>, look it up in the registry, pre-load its definition. Keep ?demo=true working as an alias for lead-qualification.
6. Update app/page.tsx — rename "Try the Demo" button to "Browse Templates" → /templates.

Rules:
- No any types.
- npm run build must pass clean at the end.

Done condition: /templates shows Hello + Lead Qualification cards; clicking "Use this template" loads a fully-configured workflow into the editor ready to run.
```

---

## Session 8 — Loop support + two new workflows

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 8 of AgentFlow Studio: minimal loop support in the engine, plus two new templates.
Session 7 (templates registry) is complete.

PART A — Loop support in the engine:
- The runner currently walks forward only. Allow an edge to point to an already-visited node and follow it, but enforce a hard max-iterations-per-node guard (default 3) to prevent infinite loops.
- lib/engine/runner.ts — track a visit count per nodeId. If a node is entered more than its max-iterations, emit a new "loop_limit" trace event and take the node's normal forward path instead of looping.
- lib/types.ts — add the loop_limit trace event type.
- No new node type: a condition node whose branch points back upstream IS the loop.

PART B — CyberOps Domain Risk Check template (lib/templates/domain-risk.ts):
input (domain) → web_search (query "{{input_1_output}} data breach security incident") → llm_call (extract risk signals as JSON: exposure, known_breaches, reputation_notes) → tool_call evaluate_output (criteria "Rate cybersecurity risk 1-10 based on these signals") → condition ({{score_1_output}} contains a number >= 7) → true: human_pause (analyst review) → output; false: straight to output.

PART C — Self-Correcting Research Agent template (lib/templates/research-agent.ts):
input (topic) → web_search → llm_call (write research brief) → tool_call evaluate_output (criteria "Rate this brief's completeness 1-10") → condition ({{quality_1_output}} score < 7) → true (low): loop back to web_search with a refined query; false (good): output. Loop guard caps retries at 3.

Register both templates in lib/templates/index.ts.

Rules:
- No any types.
- npm run build must pass clean at the end.

Done condition: Domain Risk high-risk input branches to human_pause, low-risk skips it (verified in /run). Research Agent retries at least once on a thin result and stops within 3 iterations, visible in the trace.
```

---

## Session 9 — UX clarity pass

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 9 of AgentFlow Studio: a UX clarity pass so new users aren't confused.
Sessions 7–8 are complete.

Build exactly these:
1. components/canvas/NodeStateLegend.tsx — fixed legend on the run page: yellow=running, green=done, red=error, blue=waiting for you.
2. Editor empty state — when the canvas has zero nodes, show centered helper text "Drag a node from the left to start — or load a template" with a button to /templates.
3. Condition node — show "true" / "false" labels on the two output handles ON THE CANVAS, not just in config. When dragging a connection, highlight valid target handles.
4. app/how-it-works/page.tsx — static walkthrough: what a node is, how to connect nodes, a table of the 6 node types and what each does, how {{slug_output}} references work, how to run. Link it from the landing page and editor.
5. NodeConfigPanel — when a node is selected, show a one-line description of that node type at the top.

Rules:
- No any types.
- npm run build must pass clean at the end.

Done condition: run page shows the legend; empty editor shows guidance; condition node shows true/false on canvas; /how-it-works exists and is linked.
```

---

## Session 10 — Visual design pass

```
Read CLAUDE.md, PRD.md, AGENTS.md, AND /mnt/skills/public/frontend-design/SKILL.md fully before writing any code. The frontend-design skill is mandatory reading for this session.

We are building Session 10 of AgentFlow Studio: a visual design pass so it looks intentionally designed, not default Tailwind.
Sessions 7–9 are complete.

Do this:
1. Read the frontend-design skill and follow its design-token guidance.
2. Establish a small design system: one accent color, a neutral scale, a consistent type scale (heading/body/mono), consistent spacing and border-radius — applied via Tailwind config or CSS variables. No ad-hoc per-component colors.
3. Redesign the landing page: above the fold, show the product WORKING — an embedded screenshot or looping image of the canvas + live trace mid-run. One-line headline of what it does. Primary CTA "Browse Templates", secondary "How it works" / GitHub.
4. Apply the design system across templates gallery, editor chrome, run page, eval page.
5. The trace panel is the star surface — give it the most polish: clear step names, legible latency/token chips, a visually distinct human-approval card.
6. Keep the dark theme; make it deliberate.

Rules:
- No any types.
- npm run build must pass clean at the end.

Done condition: consistent type scale/spacing/accent across all pages (no default-Tailwind look); landing page shows a running workflow above the fold; trace panel is clearly the most polished surface.
```

---

## Session 11 — README rewrite

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 11 of AgentFlow Studio: a README that reads like engineering documentation, not a product blurb.
Sessions 7–10 are complete.

Rewrite README.md with these sections:
1. One-line what-it-is + a hero screenshot placeholder of the trace panel running.
2. Architecture — a diagram and prose explaining the flow (Next.js + React Flow → SSE API routes → TypeScript execution engine: graph runner + context + tool registry → Groq function-calling with Gemini fallback → Supabase) and WHY each choice: why SSE over WebSockets, why Groq, why polling vs realtime for human-pause.
3. Failure modes and how the system handles them — Groq down, Tavily rate-limited, user closes tab mid-run, tool call fails validation. One short paragraph each.
4. War stories (real, from this build):
   (a) Zod is the single source of truth — JSON Schema for function-calling is auto-derived via z.toJSONSchema, so validation and tool-calling can't drift.
   (b) tool_use_failed retry — llama-3.3 invents fake tool names to format its final answer; the agent loop catches Groq's 400 and retries the same conversation without tools.
5. How to add a new tool — ~10-line code example using the Tool interface.
6. How to add a new node type — short example.
7. Templates — list the four shipped workflows (Hello, Lead Qualification, CyberOps Domain Risk, Self-Correcting Research) and what each demonstrates.
8. Local setup — prerequisites, env vars, Supabase migrations, npm run dev.

Rules:
- No marketing fluff. Write like an engineer.

Done condition: README has architecture rationale, failure modes, both war stories, both "how to add" examples, and an embedded hero screenshot.
```

---

## Session 12 — Guided overlay + deploy

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 12 of AgentFlow Studio: a first-run guided overlay, then deploy.
Sessions 7–11 are complete.

PART A — Guided overlay:
1. components/onboarding/GuidedTour.tsx — first time a user opens /editor, show a skippable sequence of tooltips pointing at: the node sidebar ("drag from here"), a node ("click to configure"), the Run button ("run it"), the trace panel ("watch each step"). Track "seen" with React state only — NOT localStorage (unavailable in this environment). A "Show me" button on the landing page can also trigger it.

PART B — Deploy:
2. npm run build must pass clean.
3. Deploy to Vercel free (Hobby) tier.
4. Note: human-pause needs maxDuration > 10s which Hobby caps — so the deployed demo covers editor, templates, eval, and no-pause runs; the human-pause is shown via a recorded local GIF in the README.

Rules:
- No any types.
- npm run build must pass clean at the end.

Done condition: guided overlay walks a first-time user through the editor (skippable); app deployed to a public Vercel URL; README references GIFs of the trace, human-pause, and eval runner.
```

---

# Phase 3 — Expansion (Sessions 13–18)

Read CLAUDE.md fully before each session — Phase 3 conventions and the new Supabase schema are documented there.
Commit before every session as a restore point.

---

## Session 13 — JSON Export + Shareable Links

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 13 of AgentFlow Studio: JSON export and shareable read-only links.
Sessions 1–12 are complete.

The workflow_shares table already exists in Supabase (created via SQL migration).

Build exactly these:

1. Editor toolbar — Export button
   - Fetches the current workflow's definition_json from Supabase
   - JSON.stringify(definition, null, 2) → triggers browser download as [workflow-name].json
   - No new API route needed — use the existing GET /api/workflows/[id]

2. POST /api/workflows/[id]/share
   - Generates an 8-character slug using nanoid (npm install nanoid)
   - Inserts into workflow_shares (workflow_id, slug, is_public: true)
   - Returns { slug, url: `${process.env.NEXT_PUBLIC_BASE_URL}/share/${slug}` }
   - Add NEXT_PUBLIC_BASE_URL to .env.local (e.g. http://localhost:3000)

3. GET /api/share/[slug]
   - Looks up slug in workflow_shares → joins workflows → returns definition_json + name
   - 404 if slug not found

4. app/share/[slug]/page.tsx
   - Client component, fetches GET /api/share/[slug]
   - Read-only React Flow canvas — no sidebar, no config panel, no save, no run button
   - Shows workflow name at top + a "Shared workflow — read only" badge
   - Uses the same node color scheme as the editor

5. Editor — Share button (next to Export in toolbar)
   - Calls POST /api/workflows/[id]/share
   - Shows the returned URL in a small modal with a "Copy link" button

Rules:
- No any types
- npm run build must pass clean

Done condition: Export downloads valid JSON. Share button generates a URL. Opening the URL shows the read-only canvas with correct nodes and edges.
```

---

## Session 14 — Analytics Dashboard

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 14 of AgentFlow Studio: the Workflow Insights analytics dashboard.
Sessions 1–13 are complete.

The workflow_runs table exists in Supabase. recharts is already installed.

Build exactly these:

1. Update lib/engine/runner.ts
   - On run_complete: fire-and-forget insert into workflow_runs (workflow_id, started_at from run creation, completed_at now(), status: 'completed', failed_step: null)
   - On run_error: same but status: 'failed', failed_step: the node_id that failed
   - Same fire-and-forget pattern as persistEvent — never block the SSE stream

2. GET /api/analytics
   - Query runs table: count per workflow_id, join workflows for name
   - Query run_steps: group by node_label, count total and count where status='error' → failure rate
   - Query workflow_runs: avg(completed_at - started_at) per workflow_id, max(started_at) per workflow_id
   - Return: { workflowStats: [{name, runCount, avgLatencyMs, lastRun}], stepFailures: [{nodeLabel, totalRuns, errorCount, failureRate}] }

3. app/analytics/page.tsx — "Workflow Insights" page
   - Section 1: "Run counts" — horizontal BarChart (recharts) — workflow name on Y axis, count on X axis
   - Section 2: "Avg completion time" — BarChart per workflow (ms → show as seconds)
   - Section 3: "Step failure rates" — table with columns: Step | Total Runs | Errors | Failure Rate. Color-code the failure rate cell: green < 10%, yellow 10–30%, red > 30%
   - Section 4: "Last run" — simple table: Workflow | Last Run (relative time e.g. "2 hours ago") | Status badge
   - Add "Insights" link to main nav

Rules:
- No any types
- npm run build must pass clean

Done condition: /analytics loads with real data from at least 3 runs. Bar charts render. Failure heatmap shows color-coded rates. Nav link works.
```

---

## Session 15 — RAG Infrastructure + Semantic Workflow Search

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 15 of AgentFlow Studio: RAG infrastructure and semantic workflow search.
Sessions 1–14 are complete.

The workflow_embeddings table with vector(384) and ivfflat index already exists in Supabase.
pgvector extension is already enabled.

PART A — RAG utilities:

1. lib/rag/embeddings.ts
   embed(text: string): Promise<number[]>
   - POST to https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2
   - Headers: Authorization: Bearer ${process.env.HUGGINGFACE_API_KEY}, Content-Type: application/json
   - Body: JSON.stringify({ inputs: text })
   - Response is number[][] (batch) — return response[0] (first item, length 384)
   - Throw descriptive error if response is not an array

2. lib/rag/chunker.ts
   chunkText(text: string, chunkSize = 500, overlap = 50): string[]
   - Split by whitespace into words
   - Slide a window of chunkSize words with overlap words of overlap
   - Return array of joined chunks

PART B — Workflow embedding:

3. POST /api/rag/embed-workflow
   - Body: { workflowId: string }
   - Fetch workflow from Supabase
   - Serialize content: workflow name + all node labels + all llm_call prompts joined with newlines
   - Call embed(content)
   - Upsert into workflow_embeddings (delete existing for this workflow_id first, then insert)
   - Return { success: true, workflowId }

4. Update POST /api/workflows (the save route)
   - After inserting workflow, fire-and-forget: fetch('/api/rag/embed-workflow', { method: 'POST', body: JSON.stringify({ workflowId: newWorkflow.id }) })
   - Never await it, never block the response

PART C — Search:

5. POST /api/rag/search
   - Body: { query: string }
   - Embed the query
   - Run Supabase RPC or raw SQL: SELECT workflow_id, content, 1 - (embedding <=> $1::vector) as score FROM workflow_embeddings ORDER BY embedding <=> $1::vector LIMIT 5
   - Join with workflows table to get name
   - Return [{ workflowId, name, content, score }] sorted by score desc

6. Search bar on /templates page
   - Debounced input (400ms) at the top of the page — placeholder "Search workflows by description..."
   - On input: POST /api/rag/search → replace template grid with ranked results
   - Each result card shows: workflow name, match score as percentage (score * 100, 1 decimal), "Use this template" button
   - If query empty: show normal template grid

7. NL suggestion on editor empty state
   - Below the "Drag a node from the left to start" empty state, add: "Or describe what you want to automate" with a text input and "Suggest" button
   - On submit: POST /api/rag/search → show top 3 as suggestion cards with "Use this workflow" buttons
   - Clicking a suggestion loads that workflow into the editor

Rules:
- HUGGINGFACE_API_KEY is server-side only — never in any 'use client' file
- No any types
- npm run build must pass clean

Done condition: Saving a workflow creates a workflow_embeddings row (verify in Supabase). "security domain check" returns CyberOps template ranked first. "qualify leads" returns Lead Qualification first. NL suggestion on empty editor works.
```

---

## Session 16 — Document Upload + Q&A

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 16 of AgentFlow Studio: document upload and Q&A.
Sessions 1–15 are complete.

The documents and document_chunks tables (with vector(384) indexes) exist in Supabase.

First: npm install pdf-parse mammoth @types/pdf-parse

Build exactly these:

1. lib/rag/parser.ts
   parseFile(buffer: Buffer, filetype: 'pdf' | 'docx'): Promise<string>
   - 'pdf': use pdf-parse, return result.text
   - 'docx': use mammoth, return result.value
   - Throw descriptive error for unsupported type

2. POST /api/documents/upload
   - Accept multipart/form-data with a 'file' field
   - Use request.formData() — Next.js App Router supports this natively
   - Validate: only PDF and DOCX, max 10MB
   - Parse file to text via lib/rag/parser.ts
   - Chunk text via lib/rag/chunker.ts (chunkSize=500, overlap=50)
   - For each chunk: embed it, insert into document_chunks (doc_id, chunk_index, content, embedding)
   - Insert into documents (filename, filetype)
   - Return { docId, filename, chunkCount }

3. POST /api/documents/ask
   - Body: { docId: string, question: string }
   - Embed the question
   - Cosine similarity search over document_chunks WHERE doc_id = docId, top 5
   - Build Groq prompt: system = "Answer using only the provided excerpts. For each claim, cite the excerpt number."; user = "Question: [question]\n\nExcerpts:\n[1] chunk1\n[2] chunk2..."
   - Call Groq (no tools, just text)
   - Return { answer, sources: [{ chunkIndex, content }] }

4. app/documents/page.tsx — split panel layout:
   LEFT PANEL (30% width):
   - "Documents" heading
   - Upload area: drag & drop zone + "Browse files" button. Accept .pdf and .docx only.
   - Show upload progress (uploading... / done / error)
   - List of uploaded docs: filename, filetype badge, chunk count, upload date
   - Click a doc to select it (highlighted)

   RIGHT PANEL (70% width):
   - If no doc selected: "Select a document to start asking questions"
   - If doc selected: chat interface
     - Messages list (question + answer pairs)
     - Each answer followed by collapsed "Sources" section showing cited chunks
     - Input at bottom: text field + "Ask" button
     - Loading state while waiting for answer

5. Link "Documents" in main nav

Rules:
- HUGGINGFACE_API_KEY server-side only
- No any types
- npm run build must pass clean

Done condition: Upload a PDF → appears in list with chunk count. Ask a question → answer with source citations. Drag & drop works. npm run build passes clean.
```

---

## Session 17 — PDF → Workflow Import

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 17 of AgentFlow Studio: PDF/Word document to workflow import.
Sessions 1–16 are complete. lib/rag/parser.ts exists.

Build exactly these:

1. POST /api/documents/import-workflow
   - Accept multipart/form-data with a 'file' field (PDF or DOCX)
   - Parse text via lib/rag/parser.ts
   - Send to Groq with this system prompt (exact):
     "You are a workflow extraction assistant. Given a process or SOP document, identify the main repeatable steps and output a JSON workflow definition with exactly this shape: { \"nodes\": AgentNode[], \"edges\": AgentEdge[] }. Node types available: input (entry point, no prompt needed), llm_call (has prompt and systemPrompt fields), tool_call (has tool field: one of web_search|web_fetch|extract_json|send_webhook|evaluate_output), condition (has expression field), human_pause (has message field), output (has template field). Each node must have: id (short unique string), type, label, and a data object with the type-specific fields. Edges must have: id, source, target. Always start with one input node and end with one output node. Return ONLY valid JSON, no markdown, no explanation."
   - Parse Groq's response: strip any markdown fences, JSON.parse
   - Validate with Zod: check nodes is array, edges is array, each node has id/type/label
   - If validation fails: return 400 with { error: "Could not extract a valid workflow from this document. Try a document with clearer step-by-step structure." }
   - Return { definition: WorkflowDefinition, nodeCount: number }

2. app/documents/page.tsx — add "Import as Workflow" button
   - Add to each doc in the left panel doc list: "Import as Workflow" button
   - On click: POST /api/documents/import-workflow with that doc's file... but we don't have the file anymore, only the text in chunks
   - Alternative: add a separate upload area in the doc panel just for workflow import — "Upload a process document to generate a workflow"
   - On success: store the returned definition in sessionStorage as 'importedWorkflow', navigate to /editor
   - In app/editor/page.tsx: on mount, check sessionStorage for 'importedWorkflow', if present pre-load it onto the canvas and clear sessionStorage

Wait — sessionStorage IS available in the browser (unlike localStorage which is blocked). Use sessionStorage for this cross-page handoff only.

Rules:
- No any types
- Invalid Groq response shows friendly error, never crashes
- npm run build must pass clean

Done condition: Upload a simple 3-step process doc → workflow appears on canvas with nodes matching the steps. User can edit and save. Invalid doc shows friendly error.
```

---

## Session 18 — Tests + Polish + Deploy

```
Read CLAUDE.md, PRD.md, and AGENTS.md fully before writing any code.

We are building Session 18 of AgentFlow Studio: test coverage for Phase 3, final polish, deploy.
Sessions 1–17 are complete.

PART A — Tests (all use Vitest, all offline — mock all external calls):

1. lib/rag/embeddings.test.ts
   - Mock the global fetch
   - "embed returns array of 384 numbers" — mock returns [[...384 floats...]], assert result.length === 384
   - "embed throws on non-array response" — mock returns "error string", assert throws

2. lib/rag/chunker.test.ts
   - "chunks short text into one chunk" — 100 words → 1 chunk
   - "chunks long text correctly" — 1100 words with chunkSize=500, overlap=50 → assert chunk count is correct
   - "chunks have correct overlap" — last word of chunk N appears in chunk N+1

3. lib/rag/parser.test.ts
   - Mock pdf-parse and mammoth
   - "parseFile pdf returns extracted text"
   - "parseFile docx returns extracted text"
   - "parseFile unsupported type throws"

4. app/api/analytics/route.test.ts
   - Mock Supabase
   - "GET /api/analytics returns workflowStats and stepFailures arrays"
   - "GET /api/analytics handles empty runs gracefully"

5. app/api/rag/search.test.ts
   - Mock embed() and Supabase
   - "POST /api/rag/search returns ranked results array"
   - "POST /api/rag/search with empty query returns 400"

PART B — Polish:
- Fix any visual rough edges found during manual testing of Sessions 13–17
- Ensure all new pages are linked in the main nav: Insights, Documents (Templates and Eval already linked)
- Make sure the /share/[slug] page looks clean — it's publicly shareable, so it needs to look good without any nav/sidebar chrome

PART C — Deploy:
- npm run build passes clean
- Add HUGGINGFACE_API_KEY to Vercel environment variables
- Add NEXT_PUBLIC_BASE_URL to Vercel environment variables (your production URL)
- Deploy to Vercel
- Verify /analytics, /documents, and /share/[slug] all load on production

Rules:
- All tests offline — no real API calls
- No any types
- Existing 50 tests must still pass

Done condition: All new tests pass. Existing 50 tests still pass. /analytics, /documents, /share/[slug] load on deployed URL. npm run build passes clean.
```
