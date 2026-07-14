import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withTimeout, StepTimeoutError, getStepTimeoutMs } from './with-timeout'

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.WORKFLOW_STEP_TIMEOUT_MS
  })

  it('resolves normally when fn finishes before the deadline', async () => {
    const promise = withTimeout(() => Promise.resolve('done'), 1000)
    await vi.advanceTimersByTimeAsync(10)
    await expect(promise).resolves.toBe('done')
  })

  it('rejects with StepTimeoutError once the configured duration elapses', async () => {
    const hung = new Promise<string>(() => {
      // never resolves — simulates a hung call
    })
    const promise = withTimeout(() => hung, 5000)

    const assertion = expect(promise).rejects.toThrow(StepTimeoutError)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('does not fire before the deadline', async () => {
    const hung = new Promise<string>(() => {})
    const promise = withTimeout(() => hung, 5000)
    let settled = false
    void promise.then(
      () => (settled = true),
      () => (settled = true)
    )

    await vi.advanceTimersByTimeAsync(4999)
    expect(settled).toBe(false)

    // Let it actually fire so no dangling timer/unhandled rejection leaks
    // into the next test.
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).rejects.toThrow(StepTimeoutError)
  })

  it('the timeout error carries the configured duration and a machine-readable code', async () => {
    const hung = new Promise<string>(() => {})
    const promise = withTimeout(() => hung, 1234)
    const assertion = promise.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(1234)
    const error = await assertion

    expect(error).toBeInstanceOf(StepTimeoutError)
    expect((error as StepTimeoutError).timeoutMs).toBe(1234)
    expect((error as StepTimeoutError).code).toBe('STEP_TIMEOUT')
    expect((error as StepTimeoutError).message).toContain('1234ms')
  })
})

describe('getStepTimeoutMs', () => {
  afterEach(() => {
    delete process.env.WORKFLOW_STEP_TIMEOUT_MS
  })

  it('defaults to 30000ms when unset', () => {
    delete process.env.WORKFLOW_STEP_TIMEOUT_MS
    expect(getStepTimeoutMs()).toBe(30_000)
  })

  it('reads WORKFLOW_STEP_TIMEOUT_MS when set to a valid number', () => {
    process.env.WORKFLOW_STEP_TIMEOUT_MS = '5000'
    expect(getStepTimeoutMs()).toBe(5000)
  })

  it('falls back to the default for an invalid value', () => {
    process.env.WORKFLOW_STEP_TIMEOUT_MS = 'not-a-number'
    expect(getStepTimeoutMs()).toBe(30_000)
  })
})
