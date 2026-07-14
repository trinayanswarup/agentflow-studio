// Per-step timeout guard: races a node's execution against a deadline so a
// hung call fails that step instead of freezing the whole run.
export class StepTimeoutError extends Error {
  readonly code = 'STEP_TIMEOUT'
  constructor(readonly timeoutMs: number) {
    super(`Step timed out after ${timeoutMs}ms`)
    this.name = 'StepTimeoutError'
  }
}

export function getStepTimeoutMs(): number {
  const raw = process.env.WORKFLOW_STEP_TIMEOUT_MS
  const parsed = raw !== undefined ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000
}

/**
 * Runs `fn`, rejecting with StepTimeoutError if it hasn't settled within
 * `ms`. An AbortController is created and aborted at the deadline so the
 * mechanism is extensible to cancellation-aware callers in the future; `fn`
 * itself isn't currently signal-aware, so a timed-out call keeps running in
 * the background (orphaned) rather than being forcibly cancelled — the
 * guarantee here is that the *step* settles, not that in-flight network
 * calls are torn down.
 */
export async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new StepTimeoutError(ms))
    }, ms)
  })

  const settling = fn()
  // If `fn` eventually rejects after the timeout has already won the race,
  // that rejection has nowhere to go — without this it surfaces later as an
  // unhandled promise rejection (observed as a hard crash on process exit
  // in the CLI script). We've already reported the timeout; swallow it.
  settling.catch(() => {})

  try {
    return await Promise.race([settling, timeout])
  } finally {
    clearTimeout(timer!)
  }
}
