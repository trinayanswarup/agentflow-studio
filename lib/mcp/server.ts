/**
 * lib/mcp/server.ts — MCP server for AgentFlow Studio.
 *
 * Exposes two read-only tools for debugging a specific workflow run:
 *   - get_run_details     — full step-by-step detail for one run, plus a
 *                            best-effort diagnosis distinguishing the failure
 *                            symptom from its likely upstream cause.
 *   - get_guardrail_events — every guardrail action (validation retry,
 *                            backoff retry, budget cap, step timeout) taken
 *                            during that run, with full context.
 *
 * Both take a `runId` (one execution), not a `workflowId` (many executions)
 * — a workflow ID is ambiguous about which run you mean; a run ID is not.
 *
 * TRANSPORT DECISION
 * ------------------
 * The official MCP transports are:
 *   - StdioServerTransport  — for long-running CLI processes (not serverless)
 *   - StreamableHTTPServerTransport — stateful HTTP; requires session management
 *     (mcp-session-id header + in-memory/Redis state store). Too heavy for a
 *     couple of read endpoints in a Vercel function that may be cold-started.
 *   - InMemoryTransport — pairs a Client + Server in the same process via
 *     JSON-RPC message passing; adds round-trip serialisation overhead for no
 *     benefit when caller and callee are the same process.
 *
 * Chosen approach: "thin wrapper" pattern.
 *   1. Register each tool on an `McpServer` instance — this keeps the tool
 *      definition canonical (name, description, Zod input schema,
 *      annotations) and means any future MCP client (Claude Desktop, Cursor,
 *      etc.) can connect over a proper transport without touching this file.
 *   2. Export the underlying query functions directly so Next.js API routes
 *      and the Ask Agent (lib/agent/tools.ts) can call them in one await
 *      without starting a transport, opening a JSON-RPC session, or managing
 *      state.
 *
 * Result: MCP-compliant tool definitions + zero-overhead direct invocation in
 * serverless functions.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunStepDetail {
  nodeId: string
  nodeLabel: string
  status: string
  inputPreview: string | null
  outputPreview: string | null
  /** Machine-readable failure code, e.g. OUTPUT_VALIDATION_FAILED, STEP_TIMEOUT. Null if the step didn't fail. */
  errorCode: string | null
  errorMessage: string | null
  /** Number of backoff_retry guardrail events recorded for this node in this run. */
  retryCount: number
  latencyMs: number | null
  startedAt: string
  /** Derived from startedAt + latencyMs. Null if the step never finished (still running, or the run stopped before it did). */
  finishedAt: string | null
}

export interface FailedStepSummary {
  nodeId: string
  nodeLabel: string
  errorCode: string | null
  errorMessage: string | null
}

export interface RunDetails {
  runId: string
  /** The workflow this run belongs to, for display/reference — null only if the workflow row was deleted. */
  workflowName: string | null
  status: string
  startedAt: string
  completedAt: string | null
  totalDurationMs: number | null
  steps: RunStepDetail[]
  /** The step that reported the failure — the symptom. Null if the run didn't fail. */
  failedStep: FailedStepSummary | null
  /** Best-effort diagnosis of the upstream condition that likely caused the failure. Null if the run didn't fail. */
  likelyCause: string | null
}

export type GuardrailEventType = 'validation_retry' | 'backoff_retry' | 'budget_exceeded' | 'step_timeout'

export interface GuardrailEventDetail {
  eventType: GuardrailEventType
  nodeId: string
  nodeLabel: string
  /** backoff_retry: which attempt number this was. Null for other event types. */
  attempt: number | null
  /** backoff_retry: the HTTP status that triggered it, if any. Null if it was a network/timeout error or N/A. */
  httpStatus: number | null
  /** For retry-type events (validation_retry, backoff_retry): whether the node ultimately reached 'done'. Null for non-retry events. */
  retrySucceeded: boolean | null
  errorMessage: string | null
  /** validation_retry: preview of the model output that failed validation. */
  outputPreview: string | null
  delayMs: number | null
  timeoutMs: number | null
  totalCostUsd: number | null
  capUsd: number | null
  timestamp: string
}

// ── Shared helpers ───────────────────────────────────────────────────────────

const PREVIEW_LENGTH = 200
const CAUSE_OUTPUT_SNIPPET_LENGTH = 150

function truncate(value: string | null | undefined, length = PREVIEW_LENGTH): string | null {
  if (value == null) return null
  return value.length > length ? value.slice(0, length) : value
}

function computeFinishedAt(startedAt: string, latencyMs: number | null): string | null {
  if (latencyMs == null) return null
  return new Date(new Date(startedAt).getTime() + latencyMs).toISOString()
}

// ── Likely-cause heuristic (independently testable) ─────────────────────────

export interface LikelyCauseInput {
  failedStep: RunStepDetail | null
  /** The step immediately before failedStep in execution order, if any. */
  upstreamStep: RunStepDetail | null
  /** A validation_retry guardrail event recorded for the failed step itself, if any. */
  validationEvent: { errorMessage: string; outputPreview: string } | null
}

/**
 * Distinguishes the failure symptom (the step that reported the error) from
 * its likely cause. Cause detection order:
 *   1. If the failed step's own errorCode is a recorded guardrail trip
 *      (STEP_TIMEOUT, BUDGET_EXCEEDED), that IS the cause — full stop. These
 *      are facts recorded at the moment of failure, not inferences, so they
 *      must never be superseded by the upstream-output speculation below
 *      (a step that timed out did so regardless of whether its upstream
 *      output happened to be valid JSON).
 *   2. Else if the failed step itself has a validation_retry event, the
 *      step's own LLM output is the cause (a self-inflicted failure, not
 *      upstream) — also a recorded fact, not a guess.
 *   3. Else if there's no upstream step, the failure originated here.
 *   4. Else if the upstream step produced no output, that's the likely cause.
 *   5. Else if the upstream step's output isn't valid JSON, flag that — the
 *      classic case of a condition/tool_call node choking on a malformed
 *      upstream llm_call response.
 *   6. Else, report the upstream step's output as the most likely input,
 *      without further claims — a defensible "here's what fed into the
 *      failure" rather than an overconfident diagnosis.
 */
export function detectLikelyCause(input: LikelyCauseInput): string | null {
  const { failedStep, upstreamStep, validationEvent } = input
  if (!failedStep) return null

  if (failedStep.errorCode === 'STEP_TIMEOUT') {
    return (
      `"${failedStep.nodeLabel}" itself hit the configured step timeout: ${failedStep.errorMessage ?? 'timed out'}. ` +
      `This is a recorded timeout on this step, not an upstream data problem.`
    )
  }

  if (failedStep.errorCode === 'BUDGET_EXCEEDED') {
    return (
      `"${failedStep.nodeLabel}" pushed the run over its configured cost cap: ${failedStep.errorMessage ?? 'budget exceeded'}. ` +
      `This is a recorded budget guardrail trip, not an upstream data problem.`
    )
  }

  if (validationEvent) {
    return (
      `"${failedStep.nodeLabel}" failed its own structured-output validation, even after one retry: ` +
      `${validationEvent.errorMessage}. The model's output started with: "${validationEvent.outputPreview}"`
    )
  }

  if (!upstreamStep) {
    return `"${failedStep.nodeLabel}" was the first step to run — the failure originated here, there is no upstream step to blame.`
  }

  const upstreamOutput = upstreamStep.outputPreview
  if (!upstreamOutput || upstreamOutput.trim() === '') {
    return (
      `The immediately preceding step, "${upstreamStep.nodeLabel}", produced no output — ` +
      `"${failedStep.nodeLabel}" likely failed because it had nothing valid to work with.`
    )
  }

  let jsonNote = ''
  try {
    JSON.parse(upstreamOutput)
  } catch {
    jsonNote = ' (not valid JSON — this may be why the next step could not parse or use it correctly)'
  }

  return (
    `The immediately preceding step, "${upstreamStep.nodeLabel}", produced: ` +
    `"${upstreamOutput.slice(0, CAUSE_OUTPUT_SNIPPET_LENGTH)}"${jsonNote}. ` +
    `This is the most likely input that caused "${failedStep.nodeLabel}" to fail.`
  )
}

// ── get_run_details ──────────────────────────────────────────────────────────

/**
 * Fetches full step-by-step detail for one run, plus a best-effort diagnosis
 * distinguishing the failure symptom (failedStep) from its likely upstream
 * cause (likelyCause). Throws a descriptive error if the run doesn't exist —
 * that's the actionable signal a caller (human or LLM) needs to correct a
 * bad runId, not silently return an empty shape.
 */
export async function getRunDetails(supabase: SupabaseClient, runId: string): Promise<RunDetails> {
  const { data: run, error: runError } = await supabase
    .from('runs')
    .select('id, status, created_at, completed_at, workflows(name)')
    .eq('id', runId)
    .maybeSingle()

  if (runError) {
    throw new Error(`Failed to fetch run "${runId}": ${runError.message}`)
  }
  if (!run) {
    throw new Error(
      `No run found with id "${runId}". A run ID identifies one execution — check the ID came from a ` +
        `runs table row or a run URL (/run/<id>), not a workflow ID.`
    )
  }

  // Embedded to-one relation (runs.workflow_id -> workflows.id). At runtime
  // PostgREST returns a single object (each run belongs to exactly one
  // workflow), but supabase-js's type-level select-string parser can't infer
  // cardinality and always types an embed as an array — cast through
  // `unknown` and accept either shape defensively.
  const workflowsField = (
    run as unknown as { workflows: { name: string } | { name: string }[] | null }
  ).workflows
  const workflowName = Array.isArray(workflowsField)
    ? (workflowsField[0]?.name ?? null)
    : (workflowsField?.name ?? null)

  const { data: stepRows, error: stepsError } = await supabase
    .from('run_steps')
    .select('node_id, node_label, status, output, error, error_code, latency_ms, created_at')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })

  if (stepsError) {
    throw new Error(`Failed to fetch steps for run "${runId}": ${stepsError.message}`)
  }

  const { data: guardrailRows, error: guardrailError } = await supabase
    .from('guardrail_events')
    .select('node_id, event_type, error_message, output_preview')
    .eq('run_id', runId)

  if (guardrailError) {
    throw new Error(`Failed to fetch guardrail events for run "${runId}": ${guardrailError.message}`)
  }

  const guardrails = guardrailRows ?? []

  const steps: RunStepDetail[] = (stepRows ?? []).map(
    (step: {
      node_id: string
      node_label: string
      status: string
      output: string | null
      error: string | null
      error_code: string | null
      latency_ms: number | null
      created_at: string
    }) => {
      const latencyMs = step.latency_ms ?? null
      return {
        nodeId: step.node_id,
        nodeLabel: step.node_label,
        status: step.status,
        // run_steps has no separate `input` column — the engine writes output
        // once the step completes. We surface a null input_preview to keep
        // the schema stable for a future column.
        inputPreview: null,
        outputPreview: truncate(step.output),
        errorCode: step.error_code ?? null,
        errorMessage: step.error ?? null,
        retryCount: guardrails.filter((g) => g.node_id === step.node_id && g.event_type === 'backoff_retry').length,
        latencyMs,
        startedAt: step.created_at,
        finishedAt: computeFinishedAt(step.created_at, latencyMs),
      }
    }
  )

  const failedStepDetail = steps.find((s) => s.status === 'error') ?? null
  const failedStep: FailedStepSummary | null = failedStepDetail
    ? {
        nodeId: failedStepDetail.nodeId,
        nodeLabel: failedStepDetail.nodeLabel,
        errorCode: failedStepDetail.errorCode,
        errorMessage: failedStepDetail.errorMessage,
      }
    : null

  let likelyCause: string | null = null
  if (failedStepDetail) {
    const failedIndex = steps.findIndex((s) => s.nodeId === failedStepDetail.nodeId)
    const upstreamStep = failedIndex > 0 ? steps[failedIndex - 1] : null
    const validationRow = guardrails.find(
      (g) => g.node_id === failedStepDetail.nodeId && g.event_type === 'validation_retry'
    )
    const validationEvent = validationRow
      ? { errorMessage: validationRow.error_message ?? '', outputPreview: validationRow.output_preview ?? '' }
      : null

    likelyCause = detectLikelyCause({ failedStep: failedStepDetail, upstreamStep, validationEvent })
  }

  const startedAt: string = run.created_at
  const completedAt: string | null = run.completed_at ?? null
  const totalDurationMs = completedAt
    ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
    : null

  return {
    runId: run.id,
    workflowName,
    status: run.status,
    startedAt,
    completedAt,
    totalDurationMs,
    steps,
    failedStep,
    likelyCause,
  }
}

// ── get_guardrail_events ─────────────────────────────────────────────────────

/**
 * Fetches every guardrail event recorded for one run, with full context —
 * not just event type and timestamp. Returns an empty array (not an error)
 * if the run had no guardrail events, since that's the common/happy case.
 */
export async function getGuardrailEvents(
  supabase: SupabaseClient,
  runId: string
): Promise<GuardrailEventDetail[]> {
  const { data: rows, error } = await supabase
    .from('guardrail_events')
    .select(
      'node_id, node_label, event_type, attempt, http_status, delay_ms, timeout_ms, total_cost_usd, cap_usd, error_message, output_preview, created_at'
    )
    .eq('run_id', runId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch guardrail events for run "${runId}": ${error.message}`)
  }
  if (!rows || rows.length === 0) return []

  // "Did the retry ultimately succeed?" isn't on the event itself (it's
  // recorded before the retry happens) — derive it from whether the node it
  // happened on ultimately reached 'done' in this run.
  const { data: stepRows, error: stepsError } = await supabase
    .from('run_steps')
    .select('node_id, status')
    .eq('run_id', runId)

  if (stepsError) {
    throw new Error(`Failed to fetch run steps for run "${runId}": ${stepsError.message}`)
  }

  const finalStatusByNode = new Map<string, string>()
  for (const step of (stepRows ?? []) as { node_id: string; status: string }[]) {
    finalStatusByNode.set(step.node_id, step.status)
  }

  return (
    rows as {
      node_id: string
      node_label: string
      event_type: GuardrailEventType
      attempt: number | null
      http_status: number | null
      delay_ms: number | null
      timeout_ms: number | null
      total_cost_usd: number | null
      cap_usd: number | null
      error_message: string | null
      output_preview: string | null
      created_at: string
    }[]
  ).map((row) => {
    const isRetryType = row.event_type === 'backoff_retry' || row.event_type === 'validation_retry'
    return {
      eventType: row.event_type,
      nodeId: row.node_id,
      nodeLabel: row.node_label,
      attempt: row.attempt ?? null,
      httpStatus: row.http_status ?? null,
      retrySucceeded: isRetryType ? finalStatusByNode.get(row.node_id) === 'done' : null,
      errorMessage: row.error_message ?? null,
      outputPreview: row.output_preview ?? null,
      delayMs: row.delay_ms ?? null,
      timeoutMs: row.timeout_ms ?? null,
      totalCostUsd: row.total_cost_usd ?? null,
      capUsd: row.cap_usd ?? null,
      timestamp: row.created_at,
    }
  })
}

// ── MCP server (canonical tool definitions) ───────────────────────────────────

/**
 * Creates and returns a configured McpServer instance with the
 * `get_run_details` and `get_guardrail_events` tools registered.
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
    'get_run_details',
    {
      title: 'Get run details',
      description:
        'Get full step-by-step detail for one specific workflow run, identified by its run ID (not a ' +
        'workflow ID — a workflow can have many runs, a run ID identifies exactly one execution). Returns ' +
        'the parent workflow\'s name (prefer this over the raw run ID when referring to the run in prose), ' +
        'overall status and duration, every step in execution order (node, status, input/output preview, ' +
        'exact error code and message if it failed, retry count, latency, timestamps), and — if the run ' +
        'failed — two separate fields: `failedStep` (which step reported the failure, the symptom) and ' +
        '`likelyCause` (a best-effort diagnosis of what upstream condition probably caused it, e.g. a ' +
        'preceding step returning malformed JSON). Use this before answering any question about why a run ' +
        'failed or what happened during it — never guess without calling this first.',
      inputSchema: {
        runId: z
          .string()
          .uuid()
          .describe('UUID of the run to inspect (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). One run, not a workflow.'),
      },
      annotations: {
        title: 'Get run details',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ runId }) => {
      try {
        const details = await getRunDetails(supabase, runId)
        return { content: [{ type: 'text' as const, text: JSON.stringify(details, null, 2) }] }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: message }], isError: true }
      }
    }
  )

  server.registerTool(
    'get_guardrail_events',
    {
      title: 'Get guardrail events',
      description:
        'Get every guardrail action taken during one specific workflow run, identified by its run ID: ' +
        'validation_retry (a structured LLM output failed schema validation and was retried once), ' +
        'backoff_retry (a transient 429/5xx/network error was retried with exponential backoff), ' +
        'budget_exceeded (the run was aborted for exceeding its cost cap), and step_timeout (a step ran ' +
        'longer than the configured timeout). Each event includes full context: the node it happened on, ' +
        'attempt number, and — for validation_retry — the validation error and a preview of the model ' +
        'output that failed; for backoff_retry — the HTTP status that triggered it and whether the retry ' +
        'ultimately succeeded. Returns an empty array if the run had no guardrail events (the common case). ' +
        'Call this after get_run_details when a run failed or the cause is unclear.',
      inputSchema: {
        runId: z
          .string()
          .uuid()
          .describe('UUID of the run to inspect (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). One run, not a workflow.'),
      },
      annotations: {
        title: 'Get guardrail events',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ runId }) => {
      try {
        const events = await getGuardrailEvents(supabase, runId)
        return { content: [{ type: 'text' as const, text: JSON.stringify(events, null, 2) }] }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: message }], isError: true }
      }
    }
  )

  return server
}
