// Per-run cost accumulator. A CostTracker is created once per WorkflowRunner
// run and made ambient via AsyncLocalStorage so deep call sites (callLLM in
// groq.ts) can record usage without a tracker threaded through every
// function signature — same pattern as guardrail-events.ts. runner.ts holds
// the same tracker instance directly, so it can read totals back without ALS.
import { AsyncLocalStorage } from 'node:async_hooks'
import { getPricing } from '@/lib/engine/pricing-config'

const DEFAULT_CAP_USD = 0.1

export function getCostCapUsd(): number {
  const raw = process.env.WORKFLOW_COST_CAP_USD
  const parsed = raw !== undefined ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAP_USD
}

export class CostTracker {
  private totalUsd = 0

  constructor(readonly capUsd: number = getCostCapUsd()) {}

  get totalCostUsd(): number {
    return this.totalUsd
  }

  /**
   * Estimate and accumulate the cost of one LLM call. The engine only
   * tracks total tokens per call (not the prompt/completion split), so this
   * uses a blended average of the model's input/output price — a documented
   * simplification, not an exact bill.
   */
  addUsage(model: string, tokensUsed: number): number {
    const pricing = getPricing(model)
    const blendedPer1M = (pricing.inputPer1M + pricing.outputPer1M) / 2
    this.totalUsd += (tokensUsed / 1_000_000) * blendedPer1M
    return this.totalUsd
  }

  isOverCap(): boolean {
    return this.totalUsd > this.capUsd
  }
}

const als = new AsyncLocalStorage<CostTracker>()

export function runWithCostTracker<T>(tracker: CostTracker, fn: () => Promise<T>): Promise<T> {
  return als.run(tracker, fn)
}

/** Record token usage against the ambient cost tracker for the active run, if any. */
export function recordLLMCost(model: string, tokensUsed: number): void {
  als.getStore()?.addUsage(model, tokensUsed)
}
