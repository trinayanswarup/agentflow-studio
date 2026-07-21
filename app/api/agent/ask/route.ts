/**
 * POST /api/agent/ask
 *
 * Free-form agent endpoint. Groq decides which tool to call (if any) based
 * on the user's question, via genuine function-calling. `tool_choice` is
 * forced (rather than left to 'auto') for two question shapes where testing
 * showed llama-3.3 is unreliable under 'auto': a UUID in the question
 * (forces query_workflow_logs) and discovery-style phrasing (forces
 * search_docs) — see isDiscoveryQuestion(). Anything else is left to 'auto',
 * which is the correct behavior for genuinely general questions that
 * shouldn't call a tool at all.
 *
 * Trace architecture (mirrors an eval-route LLM call, not a WorkflowRunner run):
 *   - One Langfuse trace per request via startRunTrace
 *   - recordGeneration for each Groq completion (both the tool-deciding call
 *     and the follow-up synthesis call)
 *   - runTrace.recordEvent for tool invocations
 *   - One row written to agent_decisions (fire-and-forget, same pattern as
 *     the eval route's runs insert)
 *
 * Why not reuse groqChat() / callLLM() from lib/llm/groq.ts?
 * groqChat uses lib/tools/registry.ts's runTool, which is tied to the
 * workflow-engine Tool registry. The agent tools live in lib/agent/tools.ts
 * (a separate registry). We replicate the Groq loop pattern here to keep the
 * two execution paths cleanly isolated — same rationale as gemini.ts, which
 * also implements its own loop rather than calling groqChat.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import Groq from 'groq-sdk'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'groq-sdk/resources/chat/completions'
import { createServerClient } from '@/lib/supabase/server'
import { AGENT_TOOLS, getAgentTool, runTool } from '@/lib/agent/tools'
import {
  startRunTrace,
  flushObservability,
  recordGeneration,
} from '@/lib/observability/langfuse'
import { GROQ_MODEL } from '@/lib/llm/groq'
import { withRetry } from '@/lib/engine/with-retry'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 4

const SYSTEM_PROMPT =
  'You are a helpful assistant for AgentFlow Studio, a visual AI workflow builder. ' +
  'You have two tools available:\n' +
  '- search_docs: use this when the user wants to discover or find a workflow by topic. ' +
  'Input: a natural-language search query.\n' +
  '- query_workflow_logs: use this when the user asks about run history, failures, step ' +
  'results, latency, or errors for a specific workflow. ' +
  'If the user\'s message contains a UUID (e.g. "aaaabbbb-cccc-dddd-eeee-ffffffffffff"), ' +
  'extract it and pass it as the workflowId argument — do not ask the user to repeat it.\n' +
  'Call a tool whenever the question fits one of those two categories. ' +
  'Only answer directly (no tool) for questions about general concepts or platform features. ' +
  'Be concise and specific.'

/** UUID v4 pattern — used to detect when the question already contains a workflow ID. */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * Discovery-oriented phrasing — testing showed llama-3.3 is unreliable
 * (~40-60% failure rate) at deciding on its own to call search_docs under
 * tool_choice: 'auto' for these questions: it either announces intent
 * without calling the tool ("I'll search for...") or emits raw pseudo-syntax
 * as plain text (e.g. "<|python_tag|>search_docs(...)"). When the question
 * has no UUID but matches one of these phrases, force search_docs the same
 * way UUID_PATTERN forces query_workflow_logs.
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

/**
 * Reinforcement pushed right after tool results are added to the transcript.
 * Without this, llama-3.3 sometimes ignores the actual tool result (even when
 * it's correctly present as a 'tool' role message) and instead describes the
 * tool's general capability in future tense ("will provide", "returns the
 * last 10 runs") — especially when the result is an empty array, where it
 * has been observed hallucinating that the tool "hasn't run yet." This
 * message forces it to read the JSON and cite concrete values instead.
 */
const TOOL_RESULT_INSTRUCTION =
  'The tool above has already executed — its result is the JSON in the message with role "tool". ' +
  'Answer using ONLY that JSON. Do not describe what the tool does in general, and do not say you ' +
  'are waiting for it to run — it already ran.\n' +
  '- If the JSON is an empty array, state plainly that no runs (or no matches) were found for this ' +
  'workflow. Do not invent data.\n' +
  '- If it has entries, cite concrete facts from the most recent entry: its status, its started_at ' +
  'and completed_at timestamps, its latency, and — if any step has an error — which step and what ' +
  'the error says. Do not restate the tool\'s description or talk about what it "returns" in general.'

// ── Request schema ────────────────────────────────────────────────────────────

const requestSchema = z.object({
  question: z.string().min(1).max(5000),
})

/** Shape of the JSON response — imported by app/agent/page.tsx. */
export interface AskAgentResponse {
  answer: string
  toolCalled: string | null
  toolInput: Record<string, unknown> | null
  latencyMs: number
  tokensUsed: number
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

// ── Agent loop ────────────────────────────────────────────────────────────────

interface AgentResult {
  answer: string
  toolCalled: string | null
  toolInput: Record<string, unknown> | null
  toolOutput: string | null
  tokensUsed: number
  latencyMs: number
}

/**
 * Runs the Groq function-calling loop and returns the final answer.
 */
async function runAgentLoop(
  question: string,
  runTrace: ReturnType<typeof startRunTrace>
): Promise<AgentResult> {
  const loopStarted = Date.now()

  const toolParams: ChatCompletionTool[] = AGENT_TOOLS.map((t) => ({
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

    // On the first iteration, force tool_choice for the two question shapes
    // where 'auto' has proven unreliable: a UUID present (force
    // query_workflow_logs) or discovery-style phrasing (force search_docs).
    // Otherwise leave it at 'auto' — the correct behavior for genuinely
    // general questions that shouldn't call a tool at all. On subsequent
    // iterations (tool results are already in context) always use 'auto'.
    let toolChoice: 'auto' | { type: 'function'; function: { name: string } } = 'auto'
    if (iteration === 0 && activeTools.length > 0) {
      if (UUID_PATTERN.test(question)) {
        toolChoice = { type: 'function', function: { name: 'query_workflow_logs' } }
        console.log('[agent/ask] tool_choice path: uuid-forced — forcing query_workflow_logs tool call')
      } else if (isDiscoveryQuestion(question)) {
        toolChoice = { type: 'function', function: { name: 'search_docs' } }
        console.log('[agent/ask] tool_choice path: discovery-forced — forcing search_docs tool call')
      } else {
        console.log('[agent/ask] tool_choice path: auto — no UUID or discovery phrasing detected')
      }
    }

    // Log tool params on first iteration so we can verify what Groq receives.
    if (iteration === 0) {
      console.log('[agent/ask] tool params sent to Groq:', JSON.stringify(toolParams, null, 2))
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
          result = `Error: unknown tool "${call.function.name}". Available: ${AGENT_TOOLS.map((t) => t.name).join(', ')}`
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

      messages.push({ role: 'system', content: TOOL_RESULT_INSTRUCTION })

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

  const { question } = parsed.data
  const requestStarted = Date.now()

  const runTrace = startRunTrace({
    workflowName: 'ask-agent',
    source: 'editor',
    input: question,
  })

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
  const supabase = createServerClient()
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
