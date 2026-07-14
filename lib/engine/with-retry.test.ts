import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry } from './with-retry'

class HttpError extends Error {
  constructor(readonly status: number, message = 'http error') {
    super(message)
  }
}

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries on a 500 and eventually succeeds', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(500))
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, { randomFn: () => 0 })
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on a 429', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(429))
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, { randomFn: () => 0 })
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on a 400', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new HttpError(400))

    await expect(withRetry(fn, { randomFn: () => 0 })).rejects.toThrow('http error')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on a 401', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new HttpError(401))

    await expect(withRetry(fn, { randomFn: () => 0 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('respects maxAttempts and throws the last error once exhausted', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new HttpError(503))

    const promise = withRetry(fn, { maxAttempts: 3, randomFn: () => 0 })
    // Attach a rejection handler immediately so the eventual rejection isn't
    // reported as unhandled while the fake timers advance.
    const assertion = expect(promise).rejects.toThrow('http error')
    await vi.runAllTimersAsync()
    await assertion

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('backs off exponentially with the configured base delay (no jitter)', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new HttpError(500))
    const sleepSpy = vi.spyOn(global, 'setTimeout')

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 500, randomFn: () => 0 })
    const assertion = expect(promise).rejects.toThrow()
    await vi.runAllTimersAsync()
    await assertion

    // Two retries: delays are base*2^0=500ms, base*2^1=1000ms (jitter=0).
    const delays = sleepSpy.mock.calls.map((call) => call[1])
    expect(delays).toContain(500)
    expect(delays).toContain(1000)
  })

  it('retries on a network/connection-style error with no status code', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, { randomFn: () => 0 })
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('succeeds on the first attempt without any delay', async () => {
    const fn = vi.fn<() => Promise<string>>().mockResolvedValue('ok')
    await expect(withRetry(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
