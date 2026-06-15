import { z } from 'zod'
import { defineTool, registerTool } from '@/lib/tools/registry'
import { callLLM } from '@/lib/llm/groq'

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

/** Pull the first {...} block out of an LLM response that may have prose around it. */
function extractJsonBlock(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`LLM did not return JSON. Response started with: ${text.slice(0, 120)}`)
  }
  return text.slice(start, end + 1)
}

export const extractJsonTool = defineTool({
  name: 'extract_json',
  description:
    'Extract structured data from unstructured text using an LLM. Returns a JSON object matching the given instructions.',
  schema,
  execute: async ({ text, instructions }) => {
    const result = await callLLM({
      system:
        'You are a precise data-extraction engine. Respond with a single valid JSON object and nothing else — no markdown fences, no commentary. Use null for fields you cannot find.',
      prompt: `Extract the following from the text below.\n\nInstructions: ${instructions}\n\nText:\n"""\n${text}\n"""`,
    })
    const block = extractJsonBlock(result.text)
    const parsed: unknown = JSON.parse(block)
    return JSON.stringify(parsed, null, 2)
  },
})

registerTool(extractJsonTool)
