/**
 * lib/agent/tools.ts — Tools the Ask Agent can choose to call.
 *
 * SEPARATE from lib/tools/registry.ts — that registry is for tools used inside
 * workflow node execution (called by llm_call nodes via function-calling in the
 * engine). These tools are for the freestanding /api/agent/ask endpoint and
 * must never be mixed in.
 *
 * We reuse the same Tool<TSchema> interface and defineTool() helper from
 * lib/tools/registry.ts because the shape is right, but we maintain our own
 * Map so the workflow engine's registry is untouched.
 */

import { z } from 'zod'
import { runTool, type Tool } from '@/lib/tools/registry'
import { embed } from '@/lib/rag/embeddings'
import { createServerClient } from '@/lib/supabase/server'
import { getRunDetails, getGuardrailEvents } from '@/lib/mcp/server'

// ── search_docs ───────────────────────────────────────────────────────────────

export interface WorkflowMatch {
  workflowId: string
  name: string
  score: number
}

/**
 * Semantic search over saved workflow embeddings.
 * Wraps the same logic as app/api/rag/search/route.ts, called directly
 * (no HTTP round-trip) so it can be used inside the agent loop.
 */
async function searchDocs(query: string): Promise<string> {
  let queryVec: number[]
  try {
    queryVec = await embed(query)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Embedding failed: ${msg}`)
  }

  const supabase = createServerClient()

  const { data: embeddings, error: embErr } = await supabase
    .from('workflow_embeddings')
    .select('workflow_id, content, embedding')

  if (embErr) {
    throw new Error(`Failed to fetch embeddings: ${embErr.message}`)
  }

  if (!embeddings || embeddings.length === 0) {
    return JSON.stringify([] as WorkflowMatch[])
  }

  function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom === 0 ? 0 : dot / denom
  }

  function parseVector(v: unknown): number[] {
    if (Array.isArray(v)) return v as number[]
    if (typeof v === 'string') return JSON.parse(v) as number[]
    throw new Error(`Cannot parse embedding vector: ${typeof v}`)
  }

  const scored = embeddings
    .map((row) => {
      try {
        const vec = parseVector(row.embedding)
        return {
          workflowId: row.workflow_id as string,
          content: row.content as string,
          score: cosineSimilarity(queryVec, vec),
        }
      } catch {
        return null
      }
    })
    .filter((r): r is { workflowId: string; content: string; score: number } => r !== null)

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 5)

  if (top.length === 0) {
    return JSON.stringify([] as WorkflowMatch[])
  }

  const ids = top.map((r) => r.workflowId)
  const { data: workflows, error: wfErr } = await supabase
    .from('workflows')
    .select('id, name')
    .in('id', ids)

  if (wfErr) {
    throw new Error(`Failed to fetch workflow names: ${wfErr.message}`)
  }

  const nameMap = new Map<string, string>()
  for (const wf of workflows ?? []) {
    nameMap.set(wf.id as string, wf.name as string)
  }

  const results: WorkflowMatch[] = top
    .filter((r) => nameMap.has(r.workflowId))
    .map((r) => ({
      workflowId: r.workflowId,
      name: nameMap.get(r.workflowId) ?? r.workflowId,
      score: Math.round(r.score * 1000) / 1000,
    }))

  return JSON.stringify(results)
}

export const searchDocsTool: Tool = {
  name: 'search_docs',
  description:
    'Search over saved AgentFlow Studio workflows by semantic similarity. ' +
    'Use this when the user wants to find a workflow, asks what workflows exist, ' +
    'or needs to locate a workflow related to a topic (e.g. "lead qualification", ' +
    '"domain risk check", "research agent"). ' +
    'Returns a ranked list of matching workflows with their names and similarity scores.',
  // Hand-written JSON Schema — avoids minLength and additionalProperties which
  // are not in Groq/llama's supported function-calling JSON Schema subset.
  schema: z.object({
    query: z.string().min(1).describe('Natural-language search query describing the workflow to find'),
  }),
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural-language search query describing the workflow to find',
      },
    },
    required: ['query'],
  },
  execute: (input: unknown) => {
    const { query } = input as { query: string }
    return searchDocs(query)
  },
}

// ── get_run_details ──────────────────────────────────────────────────────────

/**
 * Wraps the MCP getRunDetails function from lib/mcp/server.ts.
 * Called directly — no HTTP round-trip through the MCP API route.
 */
async function fetchRunDetails(runId: string): Promise<string> {
  const supabase = createServerClient()
  const details = await getRunDetails(supabase, runId)
  return JSON.stringify(details)
}

export const getRunDetailsTool: Tool = {
  name: 'get_run_details',
  description:
    'Get full step-by-step detail for one specific workflow run, identified by its run ID (a run ID ' +
    'identifies exactly one execution — not a workflow ID, which is ambiguous across many runs). ' +
    'Returns overall status/duration, every step with status, output preview, exact error code and ' +
    'message if it failed, retry count, and latency, plus — separately — which step reported the failure ' +
    '(failedStep) and a best-effort diagnosis of what upstream condition likely caused it (likelyCause). ' +
    'Always call this before answering any question about a specific run — never guess.',
  // Hand-written JSON Schema — omits format/pattern/additionalProperties because
  // llama-3.3 can refuse to generate a tool call when it sees JSON Schema keywords
  // it does not recognise (Groq's function-calling only supports a subset of JSON Schema).
  schema: z.object({
    runId: z.string().describe('The run UUID to inspect'),
  }),
  input_schema: {
    type: 'object',
    properties: {
      runId: {
        type: 'string',
        description:
          'The run UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) identifying one execution. ' +
          'Extract it directly from the user\'s message, or use the runId supplied with the request.',
      },
    },
    required: ['runId'],
  },
  execute: (input: unknown) => {
    const { runId } = input as { runId: string }
    return fetchRunDetails(runId)
  },
}

// ── get_guardrail_events ─────────────────────────────────────────────────────

/**
 * Wraps the MCP getGuardrailEvents function from lib/mcp/server.ts.
 * Called directly — no HTTP round-trip through the MCP API route.
 */
async function fetchGuardrailEvents(runId: string): Promise<string> {
  const supabase = createServerClient()
  const events = await getGuardrailEvents(supabase, runId)
  return JSON.stringify(events)
}

export const getGuardrailEventsTool: Tool = {
  name: 'get_guardrail_events',
  description:
    'Get every guardrail action taken during one specific workflow run: validation_retry (a structured ' +
    'LLM output that failed schema validation), backoff_retry (a transient error retried with backoff), ' +
    'budget_exceeded (the run was aborted for exceeding its cost cap), and step_timeout (a step exceeded ' +
    'its timeout). Each event includes the node it happened on, attempt number, and full context — for ' +
    'validation_retry, the validation error and a preview of the invalid model output; for backoff_retry, ' +
    'the triggering HTTP status and whether the retry ultimately succeeded. Call this after ' +
    'get_run_details when a run failed or the cause is unclear.',
  schema: z.object({
    runId: z.string().describe('The run UUID to inspect'),
  }),
  input_schema: {
    type: 'object',
    properties: {
      runId: {
        type: 'string',
        description:
          'The run UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) identifying one execution.',
      },
    },
    required: ['runId'],
  },
  execute: (input: unknown) => {
    const { runId } = input as { runId: string }
    return fetchGuardrailEvents(runId)
  },
}

// ── Agent tool registry ────────────────────────────────────────────────────────

/**
 * All tools the Ask Agent conceptually has access to. app/api/agent/ask/route.ts
 * decides per-question which of these are actually offered to Groq:
 *   - General questions: only search_docs is declared (discovery-style
 *     questions force it, everything else is 'auto') — get_run_details and
 *     get_guardrail_events are irrelevant without a run ID in play.
 *   - Run-diagnosis questions (a runId is present or extracted from the
 *     question): get_run_details and get_guardrail_events are invoked
 *     directly, deterministically — not offered to Groq as a choice at all,
 *     since we already know exactly which tool is needed and with what
 *     argument. See runDiagnosisFlow() in the route for why.
 */
export const AGENT_TOOLS: Tool[] = [searchDocsTool, getRunDetailsTool, getGuardrailEventsTool]

/**
 * Look up an agent tool by name. Returns undefined rather than throwing —
 * callers handle "unknown tool name" as a recoverable error (feed back to LLM).
 */
export function getAgentTool(name: string): Tool | undefined {
  return AGENT_TOOLS.find((t) => t.name === name)
}

// Re-export runTool so the route doesn't need an extra import from registry.
export { runTool }
