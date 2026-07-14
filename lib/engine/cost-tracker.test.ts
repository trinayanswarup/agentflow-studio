import { describe, it, expect, afterEach } from 'vitest'
import { CostTracker, runWithCostTracker, recordLLMCost, getCostCapUsd } from './cost-tracker'

describe('CostTracker', () => {
  afterEach(() => {
    delete process.env.WORKFLOW_COST_CAP_USD
  })

  it('sums token costs using the blended input/output rate for a known model', () => {
    const tracker = new CostTracker(1)
    // llama-3.3-70b-versatile: (0.59 + 0.79) / 2 = 0.69 per 1M tokens
    tracker.addUsage('llama-3.3-70b-versatile', 1_000_000)
    expect(tracker.totalCostUsd).toBeCloseTo(0.69, 5)
  })

  it('accumulates across multiple calls', () => {
    const tracker = new CostTracker(1)
    tracker.addUsage('llama-3.3-70b-versatile', 500_000)
    tracker.addUsage('llama-3.3-70b-versatile', 500_000)
    expect(tracker.totalCostUsd).toBeCloseTo(0.69, 5)
  })

  it('falls back to $0 for an unknown model', () => {
    const tracker = new CostTracker(1)
    tracker.addUsage('some-unlisted-model', 10_000_000)
    expect(tracker.totalCostUsd).toBe(0)
  })

  it('isOverCap is false under the cap and true once exceeded', () => {
    const tracker = new CostTracker(0.01)
    expect(tracker.isOverCap()).toBe(false)

    // 1M tokens of llama-3.3-70b-versatile ≈ $0.69, well over a $0.01 cap.
    tracker.addUsage('llama-3.3-70b-versatile', 1_000_000)
    expect(tracker.isOverCap()).toBe(true)
  })

  it('defaults capUsd to WORKFLOW_COST_CAP_USD, or 0.10 if unset', () => {
    delete process.env.WORKFLOW_COST_CAP_USD
    expect(getCostCapUsd()).toBe(0.1)

    process.env.WORKFLOW_COST_CAP_USD = '2.5'
    expect(getCostCapUsd()).toBe(2.5)

    process.env.WORKFLOW_COST_CAP_USD = 'not-a-number'
    expect(getCostCapUsd()).toBe(0.1)
  })

  it('recordLLMCost mutates the ambient tracker set via runWithCostTracker', async () => {
    const tracker = new CostTracker(1)
    await runWithCostTracker(tracker, async () => {
      recordLLMCost('llama-3.3-70b-versatile', 1_000_000)
    })
    expect(tracker.totalCostUsd).toBeCloseTo(0.69, 5)
  })

  it('recordLLMCost is a no-op outside any ambient tracker', () => {
    expect(() => recordLLMCost('llama-3.3-70b-versatile', 1_000_000)).not.toThrow()
  })
})
