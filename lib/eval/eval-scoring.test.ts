import { describe, it, expect } from 'vitest'
import { score } from '@/lib/eval/scoring'

describe('scoreExactMatch', () => {
  it('identical strings pass with score 10', () => {
    const result = score('Paris', 'Paris', 'exact_match')
    expect(result.pass).toBe(true)
    expect(result.score).toBe(10)
  })

  it('different strings fail with score 0', () => {
    const result = score('Paris', 'London', 'exact_match')
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
  })
})

describe('scoreContains', () => {
  it('substring present passes', () => {
    const result = score('The capital is Paris', 'Paris', 'contains')
    expect(result.pass).toBe(true)
  })

  it('substring absent fails', () => {
    const result = score('The capital is London', 'Paris', 'contains')
    expect(result.pass).toBe(false)
  })

  it('case-insensitive match passes', () => {
    const result = score('The capital is PARIS', 'paris', 'contains')
    expect(result.pass).toBe(true)
  })
})
