import Groq from 'groq-sdk'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'groq-sdk/resources/chat/completions'
import { runTool, type Tool } from '@/lib/tools/registry'
import type { LLMResult, ToolCallRecord } from '@/lib/types'
import { geminiChat, GEMINI_MODEL } from '@/lib/llm/gemini'
import { recordGeneration } from '@/lib/observability/langfuse'

export const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MAX_AGENT_ITERATIONS = 6

export interface LLMCallOptions {
  prompt: string
  system?: string
  tools?: Tool[]
  maxIterations?: number
}

let client: Groq | null = null

function getClient(): Groq {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY is not set')
    client = new Groq({ apiKey })
  }
  return client
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through — the LLM produced malformed JSON arguments
  }
  return {}
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Groq function-calling agent loop:
 * send messages → if tool_calls returned → execute tool → append result → loop
 * → until the model answers with text.
 */
export async function groqChat(options: LLMCallOptions): Promise<LLMResult> {
  const { prompt, system, tools = [], maxIterations = MAX_AGENT_ITERATIONS } = options

  const messages: ChatCompletionMessageParam[] = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt })

  const toolParams: ChatCompletionTool[] = tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))

  let tokensUsed = 0
  const toolCalls: ToolCallRecord[] = []
  let activeTools = toolParams

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let response: Groq.Chat.Completions.ChatCompletion
    try {
      response = await getClient().chat.completions.create({
        model: GROQ_MODEL,
        messages,
        ...(activeTools.length > 0 ? { tools: activeTools, tool_choice: 'auto' as const } : {}),
      })
    } catch (error) {
      // llama sometimes invents a tool name to format its final answer, which
      // Groq rejects with code "tool_use_failed". The model already has all
      // tool results in context at that point — retry without tools so it
      // answers in plain text instead of failing the whole step.
      if (activeTools.length > 0 && errorMessage(error).includes('tool_use_failed')) {
        console.warn('[llm] Groq rejected a hallucinated tool call — retrying without tools')
        activeTools = []
        continue
      }
      throw error
    }

    tokensUsed += response.usage?.total_tokens ?? 0
    const message = response.choices[0]?.message
    if (!message) throw new Error('Groq returned no choices')

    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: message.tool_calls,
      })

      for (const call of message.tool_calls) {
        const args = parseToolArguments(call.function.arguments)
        const started = Date.now()
        let result: string
        try {
          const tool = tools.find((t) => t.name === call.function.name)
          if (!tool) throw new Error(`Tool "${call.function.name}" is not available`)
          result = await runTool(tool, args)
        } catch (error) {
          // Feed the error back to the model so it can recover or rephrase.
          result = `Error: ${errorMessage(error)}`
        }
        toolCalls.push({
          name: call.function.name,
          arguments: args,
          result,
          latencyMs: Date.now() - started,
        })
        messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
      continue
    }

    return { text: message.content ?? '', tokensUsed, toolCalls, provider: 'groq' }
  }

  throw new Error(`Agent loop exceeded ${maxIterations} iterations without a final answer`)
}

/**
 * Primary entry point for all LLM calls: Groq first, Gemini 1.5 Flash on failure.
 * Records one Langfuse generation observation per call, success or failure.
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResult> {
  const started = Date.now()
  try {
    let result: LLMResult
    try {
      result = await groqChat(options)
    } catch (error) {
      console.warn(`[llm] Groq failed (${errorMessage(error)}) — falling back to Gemini`)
      result = await geminiChat(options)
    }
    recordGeneration({
      provider: result.provider,
      model: result.provider === 'gemini' ? GEMINI_MODEL : GROQ_MODEL,
      system: options.system,
      prompt: options.prompt,
      output: result.text,
      tokensUsed: result.tokensUsed,
      toolCalls: result.toolCalls,
      latencyMs: Date.now() - started,
    })
    return result
  } catch (error) {
    recordGeneration({
      provider: 'groq',
      model: `${GROQ_MODEL} (Gemini fallback also failed)`,
      system: options.system,
      prompt: options.prompt,
      latencyMs: Date.now() - started,
      error: errorMessage(error),
    })
    throw error
  }
}
