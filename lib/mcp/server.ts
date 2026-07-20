/**
 * lib/mcp/server.ts — MCP server for AgentFlow Studio.
 *
 * Exposes one tool: `query_workflow_logs`
 *
 * TRANSPORT DECISION
 * ------------------
 * The official MCP transports are:
 *   - StdioServerTransport  — for long-running CLI processes (not serverless)
 *   - StreamableHTTPServerTransport — stateful HTTP; requires session management
 *     (mcp-session-id header + in-memory/Redis state store). Too heavy for a
 *     single-tool read endpoint in a Vercel function that may be cold-started.
 *   - InMemoryTransport — pairs a Client + Server in the same process via
 *     JSON-RPC message passing; adds round-trip serialisation overhead for no
 *     benefit when caller and callee are the same process.
 *
 * Chosen approach: "thin wrapper" pattern.
 *   1. Register the tool on an `McpServer` instance — this keeps the tool
 *      definition canonical (name, description, Zod input schema) and means any
 *      future MCP client (Claude Desktop, Cursor, etc.) can connect over a
 *      proper transport without touching this file.
 *   2. Export the underlying execute function directly so the Next.js API route
 *      (app/api/mcp/query-workflow-logs/route.ts) can call it in one await without
 *      starting a transport, opening a JSON-RPC session, or managing state.
 *
 * Result: MCP-compliant tool definition + zero-overhead direct invocation in
 * serverless functions.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunStepLog {
  node_id: string
  node_label: string
  status: string
  input_preview: string | null
  output_preview: string | null
  error: string | null
  latency_ms: number | null
}

export interface RunLog {
  run_id: string
  status: string
  started_at: string
  completed_at: string | null
  steps: RunStepLog[]
}

// ── Core query function (testable, directly callable from Next.js) ─────────────

const PREVIEW_LENGTH = 200
const MAX_RUNS = 10

function truncate(value: string | null | undefined): string | null {
  if (value == null) return null
  return value.length > PREVIEW_LENGTH ? value.slice(0, PREVIEW_LENGTH) : value
}

/**
 * Queries Supabase for up to the last 10 runs of a workflow, with their steps.
 * Returns an empty array — not an error — if the workflow has no runs.
 * This function is exported for direct use by the Next.js API route and tests;
 * it does NOT go through MCP JSON-RPC transport.
 */
export async function queryWorkflowLogs(
  supabase: SupabaseClient,
  workflowId: string
): Promise<RunLog[]> {
  // Fetch the most recent MAX_RUNS runs for this workflow, newest first.
  const { data: runs, error: runsError } = await supabase
    .from('runs')
    .select('id, status, created_at, completed_at')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: false })
    .limit(MAX_RUNS)

  if (runsError) {
    throw new Error(`Failed to fetch runs: ${runsError.message}`)
  }

  // No runs → return empty array (not an error).
  if (!runs || runs.length === 0) {
    return []
  }

  const runIds = runs.map((r: { id: string }) => r.id)

  // Fetch all steps for these runs in one query.
  const { data: steps, error: stepsError } = await supabase
    .from('run_steps')
    .select('run_id, node_id, node_label, status, output, error, latency_ms')
    .in('run_id', runIds)
    .order('created_at', { ascending: true })

  if (stepsError) {
    throw new Error(`Failed to fetch run steps: ${stepsError.message}`)
  }

  // Group steps by run_id.
  const stepsByRunId = new Map<string, typeof steps>()
  for (const step of steps ?? []) {
    const runId = (step as { run_id: string }).run_id
    const existing = stepsByRunId.get(runId) ?? []
    existing.push(step)
    stepsByRunId.set(runId, existing)
  }

  // Assemble the result — runs are already ordered newest-first from the query.
  return runs.map((run: { id: string; status: string; created_at: string; completed_at: string | null }) => ({
    run_id: run.id,
    status: run.status,
    started_at: run.created_at,
    completed_at: run.completed_at,
    steps: (stepsByRunId.get(run.id) ?? []).map(
      (step: {
        node_id: string
        node_label: string
        status: string
        output?: string | null
        error?: string | null
        latency_ms?: number | null
      }) => ({
        node_id: step.node_id,
        node_label: step.node_label,
        status: step.status,
        // run_steps has no separate `input` column — the engine writes output
        // once the step completes. We surface a null input_preview to keep the
        // schema stable for future columns.
        input_preview: null,
        output_preview: truncate(step.output ?? null),
        error: step.error ?? null,
        latency_ms: step.latency_ms ?? null,
      })
    ),
  }))
}

// ── MCP server (canonical tool definition) ────────────────────────────────────

/**
 * Creates and returns a configured McpServer instance with the
 * `query_workflow_logs` tool registered.
 *
 * This is NOT connected to any transport here. Callers that need a live MCP
 * server (e.g. a future stdio or HTTP gateway) should call
 * `server.connect(transport)` after obtaining this instance.
 */
export function createMcpServer(supabase: SupabaseClient): McpServer {
  const server = new McpServer({
    name: 'agentflow-studio',
    version: '1.0.0',
  })

  server.registerTool(
    'query_workflow_logs',
    {
      description:
        'Query execution logs for a workflow. Returns the last 10 runs with their step details: node ID, label, status, a 200-char output preview, error message if any, and latency. Returns an empty array if the workflow has no runs.',
      inputSchema: {
        workflowId: z.string().uuid().describe('UUID of the workflow to query'),
      },
    },
    async ({ workflowId }) => {
      const logs = await queryWorkflowLogs(supabase, workflowId)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(logs, null, 2),
          },
        ],
      }
    }
  )

  return server
}
