/**
 * POST /api/agent/ask
 *
 * Free-form agent endpoint with two distinct flows:
 *
 *   1. General questions (no run in play) — Groq decides which tool to call
 *      (if any) based on the question, via genuine function-calling.
 *      `tool_choice` is forced away from 'auto' only for discovery-style
 *      phrasing (see isDiscoveryQuestion()), where testing showed 'auto' is
 *      unreliable with llama-3.3. Returns free-text `answer`. UNCHANGED from
 *      before this session — see runAgentLoop().
 *
 *   2. Run-diagnosis questions (a runId is supplied explicitly, or a UUID is
 *      found in the question text) — deterministic, code-enforced flow: ALWAYS
 *      calls get_run_details first, calls get_guardrail_events too if the run
 *      failed, then synthesizes a structured Diagnosis (DiagnosisSchema) via
 *      callLLMStructured. See runDiagnosisFlow().
 *
 * Why direct tool invocation (not Groq tool-calling) for run-diagnosis?
 * By the time we know a question is run-diagnosis, we already know exactly
 * which tool is needed (get_run_details, then maybe get_guardrail_events)
 * and exactly what argument to pass (the runId we already have). There's
 * nothing left for Groq's tool-choice to decide — asking it to "choose" a
 * call whose name and arguments are already fully determined would just be a
 * slower, less reliable way to do the same thing (the earlier
 * discovery-forcing fix in this file exists precisely because 'auto' proved
 * unreliable even when *forced* toward one tool; skipping the round-trip
 * entirely removes that risk rather than mitigating it). The model is only
 * asked to reason once it has real data in front of it: the final synthesis.
 *
 * Trace architecture (mirrors an eval-route LLM call, not a WorkflowRunner run):
 *   - One Langfuse trace per request via startRunTrace
 *   - recordGeneration for each Groq completion (automatic — callLLM/
 *     callLLMStructured record their own; runAgentLoop's raw-SDK calls
 *     record manually since they bypass callLLM, see below)
 *   - runTrace.recordEvent for tool invocations
 *   - One row written to agent_decisions (fire-and-forget, same pattern as
 *     the eval route's runs insert)
 *
 * Why not reuse groqChat() / callLLM() from lib/llm/groq.ts for runAgentLoop?
 * groqChat uses lib/tools/registry.ts's runTool, which is tied to the
 * workflow-engine Tool registry. The agent tools live in lib/agent/tools.ts
 * (a separate registry). We replicate the Groq loop pattern here to keep the
 * two execution paths cleanly isolated — same rationale as gemini.ts, which
 * also implements its own loop rather than calling groqChat. runDiagnosisFlow
 * doesn't have this problem — its one LLM call needs no tools at all (see
 * above), so it calls callLLMStructured directly.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import Groq from 'groq-sdk'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'groq-sdk/resources/chat/completions'
import { createServerClient } from '@/lib/supabase/server'
import { getAgentTool, runTool, searchDocsTool } from '@/lib/agent/tools'
import {
  startRunTrace,
  flushObservability,
  recordGeneration,
} from '@/lib/observability/langfuse'
import { GROQ_MODEL } from '@/lib/llm/groq'
import { withRetry } from '@/lib/engine/with-retry'
import { callLLMStructured } from '@/lib/llm/structured-output'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 4

const SYSTEM_PROMPT =
  'You are a helpful assistant for AgentFlow Studio, a visual AI workflow builder. ' +
  'You have one tool available:\n' +
  '- search_docs: use this when the user wants to discover or find a workflow by topic. ' +
  'Input: a natural-language search query.\n' +
  'Call it whenever the question fits that category. ' +
  'Only answer directly (no tool) for questions about general concepts or platform features. ' +
  'Be concise and specific.'

/** UUID v4 pattern — used to detect when the question contains a run ID. */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * Discovery-oriented phrasing — testing showed llama-3.3 is unreliable
 * (~40-60% failure rate) at deciding on its own to call search_docs under
 * tool_choice: 'auto' for these questions: it either announces intent
 * without calling the tool ("I'll search for...") or emits raw pseudo-syntax
 * as plain text (e.g. "<|python_tag|>search_docs(...)"). When the question
 * matches one of these phrases, force search_docs the same way a runId
 * forces the diagnosis flow.
 */
const DISCOVERY_KEYWORDS = [
  'do you have',
  'is there a workflow',
  'find a workflow',
  'workflow for',
  'which workflow',
  'search for',
]

function isDiscoveryQuestion(question: string): boolean {
  const lower = question.toLowerCase()
  return DISCOVERY_KEYWORDS.some((keyword) => lower.includes(keyword))
}

/** First UUID found in free text, or null. Run-diagnosis questions use this to extract a runId. */
function extractRunId(question: string): string | null {
  const match = question.match(UUID_PATTERN)
  return match ? match[0] : null
}

/**
 * A literal example is load-bearing here, not decoration — without one,
 * llama-3.3 reliably answers in prose/markdown instead (observed: a
 * "Diagnosis:" paragraph followed by backtick-quoted field labels and
 * bullet lists, zero JSON), which either fails extractJsonBlock outright or
 * (worse) lets it latch onto an unrelated JSON snippet quoted from the run
 * data embedded in the prompt, which then fails every DiagnosisSchema field.
 * Compare lib/tools/evaluate-output.ts's system prompt, which inlines the
 * exact JSON shape and reliably gets valid JSON back — same fix here.
 *
 * The example's `likelyCause` deliberately models a *recorded-fact* answer
 * (a guardrail event), not an upstream-output guess. An earlier version used
 * "the upstream step returned malformed JSON" as the example — the only
 * concrete illustration of `likelyCause` the model ever saw — and it acted
 * as an unintentional few-shot prior: even when get_run_details' own
 * `likelyCause` and get_guardrail_events both pointed at a specific recorded
 * STEP_TIMEOUT, the model still reached for an "upstream JSON" explanation
 * because that's the shape the example primed it to produce. See the
 * `likelyCause` field rule below for the explicit priority order.
 */
const DIAGNOSIS_JSON_EXAMPLE = `{
  "summary": "One or two sentences describing what happened in this run.",
  "failedStep": "Score Check",
  "evidence": ["Score Check errorCode is \\"STEP_TIMEOUT\\"", "Score Check errorMessage is \\"Step timed out after 5000ms\\""],
  "likelyCause": "Score Check itself exceeded its configured step timeout after 5000ms — a recorded guardrail event, not a guess about its input.",
  "confidence": "high",
  "recommendations": ["Increase the step timeout, or investigate why Score Check is slow"]
}`

const DIAGNOSIS_SYSTEM_PROMPT =
  'You are a workflow failure-debugging assistant for AgentFlow Studio. You have already been given the ' +
  'real execution data for the run in question below — do not describe what a tool does, and do not say ' +
  'you are about to look something up; the data is already here, read it.\n\n' +
  'Respond with ONLY a single valid JSON object — no markdown fences, no headings, no prose before or ' +
  'after, no backtick-quoted labels, no bullet lists — matching EXACTLY this shape:\n' +
  DIAGNOSIS_JSON_EXAMPLE +
  '\n\nField rules:\n' +
  '- summary: string, one or two sentences.\n' +
  '- failedStep: the failed node\'s label as a string, or JSON null if the run succeeded — never the ' +
  'literal text "null".\n' +
  '- evidence: a JSON array of short strings, each a specific fact quoted from the data (status values, ' +
  'timestamps, error messages) — never a single string, never a markdown list.\n' +
  '- likelyCause: string, one or two sentences. PRIORITY ORDER, in this exact order — use the first that ' +
  'applies and stop looking further down the list: ' +
  '(1) if a guardrail event (step_timeout, budget_exceeded, validation_retry, backoff_retry) exists for the ' +
  'failed step, or the failed step\'s own errorCode is STEP_TIMEOUT or BUDGET_EXCEEDED, that recorded event ' +
  'IS the cause — state it directly (e.g. "X hit the configured step timeout of Nms") and stop; ' +
  '(2) only if no such recorded event exists for the failed step, you may reason about the upstream step\'s ' +
  'output (missing, malformed JSON, etc.) as a speculative cause. ' +
  'Never guess about upstream JSON validity or any other unrecorded explanation when a specific, recorded ' +
  'reason for the failed step\'s own failure is already present in the data above — that recorded reason ' +
  'always wins, even if an upstream step\'s output also looks suspicious.\n' +
  '- confidence: exactly one of "low", "medium", or "high" (lowercase, no other words).\n' +
  '- recommendations: a JSON array of short strings — never a single string, never a markdown list.\n\n' +
  'Diagnose using ONLY the data provided: cite actual status values, node labels, timestamps, and error ' +
  'messages verbatim where possible. If the run completed successfully, say so plainly in `summary` rather ' +
  'than inventing a failure — set `failedStep` to null and `confidence` to "high".'

// ── Structured diagnosis schema ─────────────────────────────────────────────

const DiagnosisSchema = z.object({
  summary: z.string(),
  failedStep: z.string().nullable(),
  evidence: z.array(z.string()),
  likelyCause: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  recommendations: z.array(z.string()),
})

/** Shape of a structured run diagnosis — imported by app/agent/page.tsx. */
export type Diagnosis = z.infer<typeof DiagnosisSchema>

// ── Request schema ────────────────────────────────────────────────────────────

const requestSchema = z.object({
  question: z.string().min(1).max(5000),
  /** Optional explicit run to diagnose — set by the "Investigate failure" flow so the UI doesn't have to embed a UUID in the question text. */
  runId: z.string().uuid().optional(),
})

/** Shape of the JSON response — imported by app/agent/page.tsx. */
export interface AskAgentResponse {
  answer: string
  toolCalled: string | null
  toolInput: Record<string, unknown> | null
  latencyMs: number
  tokensUsed: number
  /** Present only when the question was a run diagnosis (an explicit or extracted runId was in play). */
  diagnosis?: Diagnosis
}

// ── Groq client (lazy singleton, identical pattern to lib/llm/groq.ts) ────────

let groqClient: Groq | null = null

function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY is not set')
    groqClient = new Groq({ apiKey })
  }
  return groqClient
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // malformed JSON — return empty, model can self-correct
  }
  return {}
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ── agent_decisions writer (fire-and-forget) ──────────────────────────────────

interface DecisionRow {
  question: string
  tool_called: string | null
  tool_input: Record<string, unknown> | null
  tool_output: unknown
  reasoning: string | null
  final_answer: string
  latency_ms: number
}

async function persistDecision(
  supabase: ReturnType<typeof createServerClient>,
  row: DecisionRow
): Promise<void> {
  try {
    await supabase.from('agent_decisions').insert(row)
  } catch (err) {
    // Must not crash the request — same pattern as persistEvent in the stream route.
    console.error('[agent/ask] Failed to write agent_decisions row:', err)
  }
}

// ── General agent loop (search_docs / no-tool paths) — unchanged behavior ────

interface AgentResult {
  answer: string
  toolCalled: string | null
  toolInput: Record<string, unknown> | null
  toolOutput: string | null
  tokensUsed: number
  latencyMs: number
}

/**
 * Runs the Groq function-calling loop for general (non-run-diagnosis)
 * questions and returns the final free-text answer. Only search_docs is
 * ever declared to Groq here — get_run_details/get_guardrail_events are
 * handled entirely by runDiagnosisFlow() and never offered as a choice.
 */
async function runAgentLoop(
  question: string,
  runTrace: ReturnType<typeof startRunTrace>
): Promise<AgentResult> {
  const loopStarted = Date.now()

  const toolParams: ChatCompletionTool[] = [searchDocsTool].map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ]

  let tokensUsed = 0
  let activeTools = toolParams

  // Track what tool was called (first one only — for agent_decisions row).
  let toolCalled: string | null = null
  let toolInput: Record<string, unknown> | null = null
  let toolOutput: string | null = null

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const iterStarted = Date.now()
    let groqResponse: Groq.Chat.Completions.ChatCompletion

    // On the first iteration, force tool_choice for discovery-style phrasing
    // — 'auto' has proven unreliable there. Otherwise leave it at 'auto',
    // the correct behavior for genuinely general questions that shouldn't
    // call a tool at all. On subsequent iterations (a tool result is
    // already in context) always use 'auto'.
    let toolChoice: 'auto' | { type: 'function'; function: { name: string } } = 'auto'
    if (iteration === 0 && activeTools.length > 0) {
      if (isDiscoveryQuestion(question)) {
        toolChoice = { type: 'function', function: { name: 'search_docs' } }
        console.log('[agent/ask] tool_choice path: discovery-forced — forcing search_docs tool call')
      } else {
        console.log('[agent/ask] tool_choice path: auto — no discovery phrasing detected')
      }
    }

    try {
      groqResponse = await withRetry(() =>
        getGroqClient().chat.completions.create({
          model: GROQ_MODEL,
          messages,
          ...(activeTools.length > 0
            ? { tools: activeTools, tool_choice: toolChoice }
            : {}),
        })
      )
    } catch (error) {
      // tool_use_failed: llama invents a tool name to format its answer.
      // Groq rejects it with code "tool_use_failed". Retry without tools so
      // the model answers in plain text — exact same recovery as groqChat().
      if (activeTools.length > 0 && errorMessage(error).includes('tool_use_failed')) {
        console.warn('[agent/ask] Groq tool_use_failed — retrying without tools')
        activeTools = []
        continue
      }
      throw error
    }

    const iterTokens = groqResponse.usage?.total_tokens ?? 0
    tokensUsed += iterTokens

    const message = groqResponse.choices[0]?.message
    if (!message) throw new Error('Groq returned no message choices')

    // Record this Groq generation in Langfuse.
    recordGeneration({
      provider: 'groq',
      model: GROQ_MODEL,
      system: SYSTEM_PROMPT,
      prompt: question,
      output: message.content ?? '',
      tokensUsed: iterTokens,
      latencyMs: Date.now() - iterStarted,
    })

    // ── Tool call branch ──────────────────────────────────────────────────────
    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: message.tool_calls,
      })

      for (const call of message.tool_calls) {
        const args = parseToolArguments(call.function.arguments)
        const tool = getAgentTool(call.function.name)
        let result: string

        if (!tool) {
          // Unknown tool — feed error back so the model can self-correct.
          result = `Error: unknown tool "${call.function.name}". Available: search_docs`
        } else {
          const toolStarted = Date.now()
          try {
            result = await runTool(tool, args)
          } catch (err) {
            result = `Error: ${errorMessage(err)}`
          }
          runTrace.recordEvent('tool_call', {
            tool: call.function.name,
            args,
            latencyMs: Date.now() - toolStarted,
          })

          // Record first successful tool invocation for agent_decisions.
          if (toolCalled === null) {
            toolCalled = call.function.name
            toolInput = args
            toolOutput = result
          }
        }

        messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      }

      continue // feed results back to the model
    }

    // ── Final text answer ─────────────────────────────────────────────────────
    return {
      answer: message.content ?? '',
      toolCalled,
      toolInput,
      toolOutput,
      tokensUsed,
      latencyMs: Date.now() - loopStarted,
    }
  }

  throw new Error(`Agent loop exceeded ${MAX_ITERATIONS} iterations without a final answer`)
}

// ── Run-diagnosis flow (get_run_details → maybe get_guardrail_events → structured synthesis) ──

interface DiagnosisFlowResult {
  diagnosis: Diagnosis
  toolsCalled: string[]
  toolInput: Record<string, unknown>
  toolOutput: string
  tokensUsed: number
  latencyMs: number
}

async function callAgentToolDirect(
  toolName: 'get_run_details' | 'get_guardrail_events',
  runId: string,
  runTrace: ReturnType<typeof startRunTrace>
): Promise<string> {
  const tool = getAgentTool(toolName)
  if (!tool) throw new Error(`Tool "${toolName}" is not registered`)
  const started = Date.now()
  const result = await runTool(tool, { runId })
  runTrace.recordEvent('tool_call', { tool: toolName, args: { runId }, latencyMs: Date.now() - started })
  return result
}

/**
 * Deterministic run-diagnosis flow. Never produces a diagnosis without
 * having called get_run_details first — that call isn't optional or
 * model-decided, it happens unconditionally before anything else. See the
 * file header for why this bypasses Groq's tool-choice entirely.
 */
async function runDiagnosisFlow(
  runId: string,
  question: string,
  runTrace: ReturnType<typeof startRunTrace>
): Promise<DiagnosisFlowResult> {
  const started = Date.now()
  const toolsCalled: string[] = []

  const runDetailsRaw = await callAgentToolDirect('get_run_details', runId, runTrace)
  toolsCalled.push('get_run_details')

  let runDetails: { failedStep: unknown }
  try {
    runDetails = JSON.parse(runDetailsRaw) as { failedStep: unknown }
  } catch {
    throw new Error(`get_run_details returned invalid JSON for run "${runId}" — cannot diagnose`)
  }

  // Guardrail events are only relevant when there's a failure to explain.
  let guardrailEventsRaw: string | null = null
  if (runDetails.failedStep !== null && runDetails.failedStep !== undefined) {
    guardrailEventsRaw = await callAgentToolDirect('get_guardrail_events', runId, runTrace)
    toolsCalled.push('get_guardrail_events')
  }

  const promptParts = [
    `The user asked: "${question}"`,
    `Real execution data for run ${runId}, from get_run_details:\n${runDetailsRaw}`,
  ]
  if (guardrailEventsRaw) {
    promptParts.push(`Guardrail events for this run, from get_guardrail_events:\n${guardrailEventsRaw}`)
  }
  promptParts.push(
    'Using ONLY the data above, respond with the JSON object described in the system prompt — nothing ' +
      'else, no other text. Evidence entries should be short, specific facts pulled from the data above ' +
      '(quote status values, timestamps, error messages) — not paraphrased generalities.'
  )

  const diagnosisPrompt = promptParts.join('\n\n')

  const { data, result } = await callLLMStructured(
    { system: DIAGNOSIS_SYSTEM_PROMPT, prompt: diagnosisPrompt },
    DiagnosisSchema
  )

  return {
    diagnosis: data,
    toolsCalled,
    toolInput: { runId },
    toolOutput: guardrailEventsRaw ? `${runDetailsRaw}\n${guardrailEventsRaw}` : runDetailsRaw,
    tokensUsed: result.tokensUsed,
    latencyMs: Date.now() - started,
  }
}

// ── POST /api/agent/ask ───────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }

  const { question, runId: explicitRunId } = parsed.data
  const effectiveRunId = explicitRunId ?? extractRunId(question)
  const requestStarted = Date.now()

  const runTrace = startRunTrace({
    workflowName: effectiveRunId ? 'ask-agent-diagnosis' : 'ask-agent',
    source: 'editor',
    input: question,
  })

  const supabase = createServerClient()

  // ── Run-diagnosis path ──────────────────────────────────────────────────
  if (effectiveRunId) {
    let diagnosisResult: DiagnosisFlowResult
    try {
      diagnosisResult = await runDiagnosisFlow(effectiveRunId, question, runTrace)
    } catch (err) {
      const message = errorMessage(err)
      runTrace.finish({ output: '', status: 'failed', error: message })
      await flushObservability()
      return NextResponse.json({ error: message }, { status: 500 })
    }

    runTrace.finish({ output: diagnosisResult.diagnosis.summary, status: 'completed' })
    await flushObservability()

    void persistDecision(supabase, {
      question,
      tool_called: diagnosisResult.toolsCalled.join(' + '),
      tool_input: diagnosisResult.toolInput,
      tool_output: diagnosisResult.toolOutput,
      reasoning: null,
      final_answer: diagnosisResult.diagnosis.summary,
      latency_ms: Date.now() - requestStarted,
    })

    const response: AskAgentResponse = {
      answer: diagnosisResult.diagnosis.summary,
      toolCalled: diagnosisResult.toolsCalled.join(' + '),
      toolInput: diagnosisResult.toolInput,
      latencyMs: diagnosisResult.latencyMs,
      tokensUsed: diagnosisResult.tokensUsed,
      diagnosis: diagnosisResult.diagnosis,
    }
    return NextResponse.json(response)
  }

  // ── General question path — unchanged ───────────────────────────────────
  let result: AgentResult
  try {
    result = await runAgentLoop(question, runTrace)
  } catch (err) {
    const message = errorMessage(err)
    runTrace.finish({ output: '', status: 'failed', error: message })
    await flushObservability()
    return NextResponse.json({ error: message }, { status: 500 })
  }

  runTrace.finish({ output: result.answer, status: 'completed' })
  await flushObservability()

  // Persist decision (fire-and-forget).
  void persistDecision(supabase, {
    question,
    tool_called: result.toolCalled,
    tool_input: result.toolInput,
    tool_output: result.toolOutput,
    reasoning: null, // llama-3.3 does not emit explicit reasoning text
    final_answer: result.answer,
    latency_ms: Date.now() - requestStarted,
  })

  const response: AskAgentResponse = {
    answer: result.answer,
    toolCalled: result.toolCalled,
    toolInput: result.toolInput,
    latencyMs: result.latencyMs,
    tokensUsed: result.tokensUsed,
  }
  return NextResponse.json(response)
}
