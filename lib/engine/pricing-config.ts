// Pricing map for cost estimation — model name -> USD per 1,000,000 tokens.
// Groq and Gemini are used here on free tiers, so these figures are
// approximate list prices, not what this app actually pays. The mechanism
// (accumulate cost, abort at a cap) matters more than exact numbers — update
// this map when real billing applies.
export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
}

export const PRICING: Record<string, ModelPricing> = {
  'llama-3.3-70b-versatile': { inputPer1M: 0.59, outputPer1M: 0.79 },
  'gemini-2.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
}

/** Used for any model not listed in PRICING (e.g. GEMINI_MODEL overridden via env). */
export const DEFAULT_PRICING: ModelPricing = { inputPer1M: 0, outputPer1M: 0 }

export function getPricing(model: string): ModelPricing {
  return PRICING[model] ?? DEFAULT_PRICING
}
