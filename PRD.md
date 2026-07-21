# AgentFlow Studio — Product Requirements

## What it is

A visual AI workflow builder. Users drag nodes onto a canvas, connect them, and run them. The execution engine walks the graph, calls LLMs, invokes tools, streams live trace events, and handles human-in-the-loop review pauses.

Built as a portfolio project targeting AI engineering roles. No LangChain, no orchestration framework — every layer built from scratch.

---

## Problem

Building AI automations today requires either writing raw LLM code (high friction, hard to inspect) or using integration platforms like n8n (built for app connectors, not agent loops). There is no tool focused on the agent orchestration layer — tool calling, conditional branching, human review, output evaluation — that a developer can actually inspect and extend.

---

## Solution

A canvas-based workflow builder where each node is a step in an agent pipeline. The engine handles the hard parts: function-calling loops, branching, looping, human pauses, and live observability. Users build workflows visually, run them, watch each step in real time, and evaluate output quality.

---

## Users

Developers and AI engineers who want to build, test, and iterate on agent workflows without writing a new orchestration harness from scratch.

---

## Features

### Core

- **Visual editor** — drag-and-drop canvas with 6 node types, live config panel, variable references via `{{slug_output}}`
- **Execution engine** — graph walker with SSE streaming, Groq function-calling loop, Gemini fallback, condition branching, loop guard (max 3 iterations), human-pause polling
- **Human-in-the-loop** — workflows pause at review nodes; user can approve, edit the output, or reject before execution continues
- **Eval framework** — run test cases with exact match, contains, or LLM-as-judge scoring; results and scores persisted

### Templates

Four pre-built workflows ship with the product:

- **Hello** — starter, 2 seconds, no tools
- **Lead Qualification** — web search + LLM extraction + scoring + human review
- **CyberOps Domain Risk Check** — risk signal extraction + conditional branching (high risk → analyst review, low risk → auto-pass)
- **Self-Correcting Research Agent** — LLM brief + quality scoring + loop-back retry if score is insufficient

### Knowledge layer

- **Semantic search** — every saved workflow is embedded on save; search by natural language query; cosine similarity ranking via pgvector
- **Document Q&A** — upload PDF or Word document; chunked, embedded, stored; ask questions and get answers with cited source excerpts
- **PDF → workflow import** — upload a process or SOP document; Groq extracts the steps and generates a workflow on the canvas

### Production engineering

- **Observability** — every run traced end-to-end via Langfuse: one span per node, one generation per LLM call (model, prompt, response, tokens, latency). No-op when unconfigured.
- **Guardrails** — structured output validated with Zod (one retry, then a clean failure); retries with exponential backoff on transient errors; per-run cost caps; per-step timeouts.
- **Eval regression suite** — golden test cases including dedicated cases verifying the guardrails themselves fire correctly. Mock cases run in CI on every push with zero API keys; live cases run on demand.

### Ask Agent — failure-debugging assistant

- A chat interface where the agent decides which tool to call based on the question — genuine Groq tool-use, not hardcoded routing
- **Discovery**: "Do you have a workflow for X?" → searches saved workflows semantically
- **Diagnosis**: "Why did run [id] fail?" → the agent is required to read the run's actual execution data via an MCP-compliant tool before answering, pulls any recorded guardrail events, and returns a structured diagnosis — Summary, Evidence, Likely Cause, Confidence, Recommendations — never speculating when a recorded fact is available
- An "Investigate failure" button on any failed run jumps straight into a pre-loaded diagnosis
- Built using the Model Context Protocol — tool definitions are MCP-compliant (proper schemas, annotations); called directly within the app due to a serverless hosting constraint (see README architecture section)

### Utilities

- **Workflow Insights** — run counts, avg completion time, step failure rates across all workflows
- **Export** — download any workflow as a JSON file
- **Share** — generate a public read-only link to any workflow
- **Workflow Library** — browse all saved workflows, open in editor, run, or share

---

## Node types

| Node          | Purpose                                                     |
| ------------- | ----------------------------------------------------------- |
| `input`       | Entry point — receives the user's input string              |
| `llm_call`    | Runs the Groq agent loop with configurable prompt and tools |
| `tool_call`   | Calls a tool directly without going through the LLM         |
| `condition`   | Evaluates an expression and branches true or false          |
| `human_pause` | Halts execution until a human approves, edits, or rejects   |
| `output`      | End point — returns the final result                        |

---

## Tools

**Workflow engine tools** (used inside `tool_call`/`llm_call` nodes):

| Tool              | Purpose                                          |
| ----------------- | ------------------------------------------------ |
| `web_search`      | Tavily API — semantic web search                 |
| `web_fetch`       | Fetches a URL and returns page content           |
| `extract_json`    | Extracts a value from JSON by dot-path           |
| `send_webhook`    | HTTP POST to any URL with a JSON body            |
| `evaluate_output` | LLM-as-judge — scores output 1–10 with reasoning |

**Ask Agent tools** (a separate registry, for the diagnosis feature):

| Tool                   | Purpose                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `search_docs`          | Semantic search over saved workflows                                                                                                      |
| `get_run_details`      | Full execution trace for a run — status, per-step timing, error, and a distinction between the step that failed and what likely caused it |
| `get_guardrail_events` | Recorded guardrail events for a run (timeout, budget exceeded, validation retry, backoff retry) with full context                         |

---

## Stack

| Layer            | Technology                                                          |
| ---------------- | ------------------------------------------------------------------- |
| Frontend         | Next.js 14, TypeScript, Tailwind CSS, React Flow                    |
| Execution engine | TypeScript, Next.js API routes, SSE streaming                       |
| LLM              | Groq llama-3.3-70b-versatile (primary), Gemini 2.5 Flash (fallback) |
| Search           | Tavily API                                                          |
| Embeddings       | Hugging Face sentence-transformers/all-MiniLM-L6-v2 (384-dim)       |
| Vector search    | Supabase pgvector, ivfflat index, cosine similarity                 |
| Document parsing | pdf-parse, mammoth                                                  |
| Observability    | Langfuse                                                            |
| Protocol         | Model Context Protocol (MCP) — @modelcontextprotocol/sdk            |
| Database         | Supabase (PostgreSQL)                                               |
| Validation       | Zod — tool inputs, API route bodies, structured LLM outputs         |
| Testing          | Vitest — 128+ unit/integration tests, 17 eval regression cases      |
| CI               | GitHub Actions — type check, build, lint, unit tests, mock evals    |
| Deploy           | Vercel                                                              |

---

## Screens

| Screen       | URL             | Purpose                                                                    |
| ------------ | --------------- | -------------------------------------------------------------------------- |
| Landing      | `/`             | Product overview, feature cards, direct links to each capability           |
| Editor       | `/editor`       | Drag-and-drop workflow builder                                             |
| Run          | `/run/[id]`     | Live trace panel, node highlighting, human approval, "Investigate failure" |
| Templates    | `/templates`    | Template gallery with semantic search                                      |
| Library      | `/library`      | All saved workflows — open, run, share                                     |
| Documents    | `/documents`    | Upload docs, Q&A, import as workflow                                       |
| Analytics    | `/analytics`    | Workflow run insights and failure rates                                    |
| Share        | `/share/[slug]` | Public read-only workflow canvas                                           |
| Eval         | `/eval`         | Test case runner with scoring                                              |
| Ask Agent    | `/agent`        | Failure-debugging chat assistant                                           |
| How it works | `/how-it-works` | Guided walkthrough for new users                                           |

---

## Non-goals

No authentication, no multi-user support, no billing, no mobile-specific design. Single-user portfolio project. RLS intentionally disabled on Supabase for this reason.
