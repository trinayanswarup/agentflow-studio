import { z } from 'zod'

/**
 * Shape returned by every LLM-as-judge call: evaluate_output, and the eval
 * runner's llm_judge scoring strategy. Kept in one place so both call sites
 * validate against the same contract.
 *
 * `score` intentionally has no min/max here: judges are asked for 1-10 but
 * occasionally drift outside that range (0, 11, ...) despite the prompt —
 * that's a values problem, not a shape problem, so callers clamp it
 * themselves. Rejecting on range would trigger a validation retry (and
 * potentially fail the step) for a case the app has always tolerated by
 * clamping. What this schema DOES catch: non-JSON text, a missing `score`
 * field, or a non-numeric `score` — genuine structural failures.
 */
export const judgeScoreSchema = z.object({
  score: z.number(),
  reasoning: z.string().optional(),
})

export type JudgeScore = z.infer<typeof judgeScoreSchema>
