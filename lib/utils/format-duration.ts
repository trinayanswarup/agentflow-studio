/**
 * Formats a millisecond duration as a human-readable string, e.g. for
 * surfacing a configured timeout (WORKFLOW_HUMAN_PAUSE_TIMEOUT_MS) in an
 * error message instead of a raw "300000ms".
 *
 *   formatDuration(45_000)  → "45 seconds"
 *   formatDuration(60_000)  → "1 minute"
 *   formatDuration(90_000)  → "1 minute 30 seconds"
 *   formatDuration(300_000) → "5 minutes"
 */
export function formatDuration(ms: number): string {
  if (ms < 60_000) {
    const seconds = Math.round(ms / 1000)
    return `${seconds} second${seconds === 1 ? '' : 's'}`
  }

  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  const minutesPart = `${minutes} minute${minutes === 1 ? '' : 's'}`
  if (seconds === 0) return minutesPart
  return `${minutesPart} ${seconds} second${seconds === 1 ? '' : 's'}`
}
