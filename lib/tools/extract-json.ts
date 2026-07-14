import { z } from 'zod'
import { defineTool, registerTool } from '@/lib/tools/registry'
import { callLLMStructured } from '@/lib/llm/structured-output'

/**
 * Traverse a dotted path through a plain JavaScript value.
 * Throws a descriptive error if any segment is missing or not traversable.
 */
export function jsonPath(input: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = input
  for (const key of parts) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Path "${path}" not found: "${key}" is not traversable`)
    }
    const record = current as Record<string, unknown>
    if (!(key in record)) {
      throw new Error(`Path "${path}" not found: key "${key}" does not exist`)
    }
    current = record[key]
  }
  return current
}

const schema = z.object({
  text: z.string().min(1).describe('The unstructured text to extract data from'),
  instructions: z
    .string()
    .min(1)
    .describe('What to extract and the desired JSON shape, e.g. "company name, industry, employee count as {name, industry, employees}"'),
})

// The extracted shape is arbitrary (driven by freeform `instructions`), so we
// can only validate "this is a JSON object" — not a fixed field set. That's
// still enough to catch prose/markdown-wrapped non-JSON responses and get
// the one-retry-with-correction behavior of callLLMStructured.
const extractedJsonSchema = z.record(z.string(), z.unknown())

export const extractJsonTool = defineTool({
  name: 'extract_json',
  description:
    'Extract structured data from unstructured text using an LLM. Returns a JSON object matching the given instructions.',
  schema,
  execute: async ({ text, instructions }) => {
    const { data } = await callLLMStructured(
      {
        system:
          'You are a precise data-extraction engine. Respond with a single valid JSON object and nothing else — no markdown fences, no commentary. Use null for fields you cannot find.',
        prompt: `Extract the following from the text below.\n\nInstructions: ${instructions}\n\nText:\n"""\n${text}\n"""`,
      },
      extractedJsonSchema
    )
    return JSON.stringify(data, null, 2)
  },
})

registerTool(extractJsonTool)
