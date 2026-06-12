import { z } from 'zod'

/**
 * A tool callable by the engine (tool_call nodes) and by LLMs (function calling).
 * `schema` is the source of truth; `input_schema` is the JSON Schema derived
 * from it, in the shape Groq/Gemini function declarations expect.
 */
export interface Tool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  description: string
  schema: TSchema
  input_schema: Record<string, unknown>
  execute: (input: z.infer<TSchema>) => Promise<string>
}

export function defineTool<TSchema extends z.ZodTypeAny>(options: {
  name: string
  description: string
  schema: TSchema
  execute: (input: z.infer<TSchema>) => Promise<string>
}): Tool<TSchema> {
  const jsonSchema = z.toJSONSchema(options.schema) as Record<string, unknown>
  delete jsonSchema['$schema']
  return { ...options, input_schema: jsonSchema }
}

/**
 * Validate raw input against the tool's Zod schema, then execute.
 * Invalid input never reaches `execute()`.
 */
export async function runTool(tool: Tool, rawInput: unknown): Promise<string> {
  const parsed = tool.schema.safeParse(rawInput)
  if (!parsed.success) {
    throw new Error(`Invalid input for tool "${tool.name}": ${z.prettifyError(parsed.error)}`)
  }
  return tool.execute(parsed.data)
}

const registry = new Map<string, Tool>()

export function registerTool(tool: Tool): void {
  registry.set(tool.name, tool)
}

export function getTool(name: string): Tool {
  const tool = registry.get(name)
  if (!tool) {
    const known = [...registry.keys()].join(', ') || '(none registered)'
    throw new Error(`Unknown tool "${name}". Registered tools: ${known}`)
  }
  return tool
}

export function listTools(): Tool[] {
  return [...registry.values()]
}
