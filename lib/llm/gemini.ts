import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  FunctionDeclaration,
  FunctionDeclarationSchema,
  Part,
} from '@google/generative-ai'
import { runTool, type Tool } from '@/lib/tools/registry'
import type { LLMResult, ToolCallRecord } from '@/lib/types'
// Type-only import — erased at compile time, so no runtime cycle with groq.ts.
import type { LLMCallOptions } from '@/lib/llm/groq'

// gemini-1.5-flash (the original plan) was retired by Google — 404s as of mid-2026.
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const MAX_AGENT_ITERATIONS = 6

let client: GoogleGenerativeAI | null = null

function getClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
    client = new GoogleGenerativeAI(apiKey)
  }
  return client
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Gemini rejects JSON Schema keywords it doesn't know ($schema,
 * additionalProperties, ...), so keep only the keys it understands.
 */
function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const keep = ['type', 'description', 'enum', 'format', 'nullable', 'required']
  const out: Record<string, unknown> = {}
  for (const key of keep) {
    if (schema[key] !== undefined) out[key] = schema[key]
  }
  if (isRecord(schema.properties)) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, prop]) => [
        name,
        isRecord(prop) ? sanitizeSchema(prop) : prop,
      ])
    )
  }
  if (isRecord(schema.items)) out.items = sanitizeSchema(schema.items)
  return out
}

function toFunctionDeclaration(tool: Tool): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: sanitizeSchema(tool.input_schema) as unknown as FunctionDeclarationSchema,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Gemini fallback — same agent-loop contract as groqChat.
 */
export async function geminiChat(options: LLMCallOptions): Promise<LLMResult> {
  const { prompt, system, tools = [], maxIterations = MAX_AGENT_ITERATIONS } = options

  const model = getClient().getGenerativeModel({
    model: GEMINI_MODEL,
    ...(system ? { systemInstruction: system } : {}),
    ...(tools.length > 0
      ? { tools: [{ functionDeclarations: tools.map(toFunctionDeclaration) }] }
      : {}),
  })

  const chat = model.startChat()
  let tokensUsed = 0
  const toolCalls: ToolCallRecord[] = []

  let response = (await chat.sendMessage(prompt)).response
  tokensUsed += response.usageMetadata?.totalTokenCount ?? 0

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const calls = response.functionCalls() ?? []
    if (calls.length === 0) {
      return { text: response.text(), tokensUsed, toolCalls, provider: 'gemini' }
    }

    const parts: Part[] = []
    for (const call of calls) {
      const args = isRecord(call.args) ? call.args : {}
      const started = Date.now()
      let result: string
      try {
        const tool = tools.find((t) => t.name === call.name)
        if (!tool) throw new Error(`Tool "${call.name}" is not available`)
        result = await runTool(tool, args)
      } catch (error) {
        result = `Error: ${errorMessage(error)}`
      }
      toolCalls.push({ name: call.name, arguments: args, result, latencyMs: Date.now() - started })
      parts.push({ functionResponse: { name: call.name, response: { result } } })
    }

    response = (await chat.sendMessage(parts)).response
    tokensUsed += response.usageMetadata?.totalTokenCount ?? 0
  }

  throw new Error(`Agent loop exceeded ${maxIterations} iterations without a final answer`)
}
