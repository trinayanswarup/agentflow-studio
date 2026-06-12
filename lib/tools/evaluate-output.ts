import { z } from 'zod'
import { defineTool, registerTool } from '@/lib/tools/registry'
import { callLLM } from '@/lib/llm/groq'

const schema = z.object({
  output: z.string().min(1).describe('The output text to evaluate'),
  criteria: z
    .string()
    .min(1)
    .describe('What a good output looks like, e.g. "mentions industry, HQ location, and employee count"'),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const evaluateOutputTool = defineTool({
  name: 'evaluate_output',
  description:
    'Score a piece of output 1-10 against given criteria using an LLM judge. Returns JSON {"score": number, "reasoning": string}.',
  schema,
  execute: async ({ output, criteria }) => {
    const result = await callLLM({
      system:
        'You are a strict quality judge. Respond with a single valid JSON object {"score": <integer 1-10>, "reasoning": "<one or two sentences>"} and nothing else.',
      prompt: `Criteria: ${criteria}\n\nOutput to evaluate:\n"""\n${output}\n"""\n\nScore the output 1-10 against the criteria.`,
    })

    const start = result.text.indexOf('{')
    const end = result.text.lastIndexOf('}')
    if (start === -1 || end <= start) {
      throw new Error(`Judge did not return JSON: ${result.text.slice(0, 120)}`)
    }
    const parsed: unknown = JSON.parse(result.text.slice(start, end + 1))
    if (!isRecord(parsed) || typeof parsed.score !== 'number') {
      throw new Error(`Judge returned unexpected shape: ${result.text.slice(0, 120)}`)
    }

    const score = Math.min(10, Math.max(1, Math.round(parsed.score)))
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : ''
    return JSON.stringify({ score, reasoning })
  },
})

registerTool(evaluateOutputTool)
