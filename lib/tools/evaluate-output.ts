import { z } from 'zod'
import { defineTool, registerTool } from '@/lib/tools/registry'
import { callLLMStructured } from '@/lib/llm/structured-output'
import { judgeScoreSchema } from '@/lib/schemas/judge-score'

const schema = z.object({
  output: z.string().min(1).describe('The output text to evaluate'),
  criteria: z
    .string()
    .min(1)
    .describe('What a good output looks like, e.g. "mentions industry, HQ location, and employee count"'),
})

export const evaluateOutputTool = defineTool({
  name: 'evaluate_output',
  description:
    'Score a piece of output 1-10 against given criteria using an LLM judge. Returns JSON {"score": number, "reasoning": string}.',
  schema,
  execute: async ({ output, criteria }) => {
    const { data } = await callLLMStructured(
      {
        system:
          'You are a strict quality judge. Respond with a single valid JSON object {"score": <integer 1-10>, "reasoning": "<one or two sentences>"} and nothing else.',
        prompt: `Criteria: ${criteria}\n\nOutput to evaluate:\n"""\n${output}\n"""\n\nScore the output 1-10 against the criteria.`,
      },
      judgeScoreSchema
    )

    const score = Math.min(10, Math.max(1, Math.round(data.score)))
    return JSON.stringify({ score, reasoning: data.reasoning ?? '' })
  },
})

registerTool(evaluateOutputTool)
