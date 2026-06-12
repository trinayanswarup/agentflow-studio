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

// ── Friendly validation-error formatting ─────────────────────────────────────

type JsonSchemaProps = Record<string, { description?: string; format?: string; type?: string }>

/**
 * Convert a ZodError into a plain-English message naming the tool, the
 * problematic argument, what was expected, and what was actually received.
 */
function buildFriendlyError(
  tool: Tool,
  input: Record<string, unknown>,
  error: z.ZodError
): string {
  const props =
    (
      tool.input_schema as { properties?: JsonSchemaProps }
    ).properties ?? {}

  const lines: string[] = []

  for (const issue of error.issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : undefined
    if (!field) continue

    const actual = input[field]
    const isEmpty =
      actual === undefined || actual === null || String(actual).trim() === ''

    // Describe what the field expects based on JSON Schema metadata.
    const prop = props[field]
    let expected: string
    if (prop?.format === 'uri') {
      expected = 'a valid URL (e.g. https://...)'
    } else if (prop?.description) {
      expected = prop.description
    } else {
      expected = 'a non-empty string'
    }

    // Describe what was actually provided.
    let received: string
    if (isEmpty) {
      received =
        'the mapped value was empty — check that the upstream node produced the right output and this argument references it (e.g. {{nodeId_output}})'
    } else {
      const preview = String(actual).slice(0, 80)
      const suffix = String(actual).length > 80 ? '…' : ''
      const formatHint = prop?.format === 'uri' ? 'a valid URL' : 'a valid value'
      received = `received "${preview}${suffix}" which is not ${formatHint}`
    }

    lines.push(`${tool.name} needs '${field}' (${expected}), but ${received}.`)
  }

  return lines.length > 0
    ? lines.join('\n')
    : `${tool.name}: validation failed — ${z.prettifyError(error)}`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate raw input against the tool's Zod schema, then execute.
 * Invalid input never reaches `execute()`. Validation errors are formatted as
 * plain-English messages that name the tool, the bad argument, what was
 * expected, and what was received.
 */
export async function runTool(tool: Tool, rawInput: unknown): Promise<string> {
  const inputObj: Record<string, unknown> =
    typeof rawInput === 'object' && rawInput !== null && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : {}

  const parsed = tool.schema.safeParse(rawInput)
  if (!parsed.success) {
    throw new Error(buildFriendlyError(tool, inputObj, parsed.error))
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
