import { describe, it, expect } from 'vitest'
import { formatDuration } from './format-duration'

describe('formatDuration', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatDuration(1)).toBe('0 seconds')
    expect(formatDuration(1_000)).toBe('1 second')
    expect(formatDuration(45_000)).toBe('45 seconds')
    expect(formatDuration(59_000)).toBe('59 seconds')
  })

  it('rounds sub-minute durations to the nearest second', () => {
    expect(formatDuration(1_499)).toBe('1 second')
    expect(formatDuration(1_500)).toBe('2 seconds')
  })

  it('formats exact-minute durations without a seconds remainder', () => {
    expect(formatDuration(60_000)).toBe('1 minute')
    expect(formatDuration(300_000)).toBe('5 minutes')
    expect(formatDuration(120_000)).toBe('2 minutes')
  })

  it('formats minute-plus-seconds durations with both parts', () => {
    expect(formatDuration(90_000)).toBe('1 minute 30 seconds')
    expect(formatDuration(150_000)).toBe('2 minutes 30 seconds')
    expect(formatDuration(61_000)).toBe('1 minute 1 second')
  })
})
