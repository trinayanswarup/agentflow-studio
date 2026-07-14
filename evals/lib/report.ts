import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { CaseResult } from './types'

export function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'unknown'
  }
}

export function printResultsTable(results: CaseResult[], suiteLabel: string): void {
  const idWidth = Math.max(2, ...results.map((r) => r.id.length))

  console.log('')
  console.log(`── Eval results: ${suiteLabel} ──`)
  console.log(`${'ID'.padEnd(idWidth)}  STATUS  LATENCY   DESCRIPTION`)
  console.log('-'.repeat(idWidth + 42))

  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL'
    console.log(`${r.id.padEnd(idWidth)}  ${status.padEnd(6)}  ${String(r.latencyMs).padStart(6)}ms  ${r.description}`)
    if (!r.pass && r.reason) {
      console.log(`${' '.repeat(idWidth)}          └─ ${r.reason}`)
    }
  }

  const passed = results.filter((r) => r.pass).length
  const total = results.length
  const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0'
  console.log('-'.repeat(idWidth + 42))
  console.log(`${passed}/${total} passed (${rate}%)`)
  console.log('')
}

/**
 * Fire-and-forget: writes one summary row to the `eval_runs` Supabase table
 * (see evals/eval_runs.sql). Never throws — a missing Supabase config or a
 * failed insert is logged and swallowed so it can't fail the eval run itself.
 */
export async function persistEvalRun(results: CaseResult[], suite: 'mock' | 'live'): Promise<void> {
  const total = results.length
  const passed = results.filter((r) => r.pass).length
  const failed = total - passed
  const passRate = total > 0 ? passed / total : 0

  try {
    const { createServerClient } = await import('@/lib/supabase/server')
    const supabase = createServerClient()
    const { error } = await supabase.from('eval_runs').insert({
      run_id: randomUUID(),
      git_sha: getGitSha(),
      total,
      passed,
      failed,
      pass_rate: passRate,
      results_json: results,
    })
    if (error) {
      console.warn(`[evals] eval_runs insert failed (${suite}):`, error.message)
    }
  } catch (error) {
    console.warn(
      `[evals] Could not write eval_runs row (${suite}) — Supabase likely not configured:`,
      error instanceof Error ? error.message : String(error)
    )
  }
}
