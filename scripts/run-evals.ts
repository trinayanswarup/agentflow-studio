/**
 * Runs every 'live'-tagged case in evals/cases/ against the real engine —
 * real Groq, real Tavily, no mocking. Requires real API keys.
 *
 *   npx tsx scripts/run-evals.ts
 *   npm run evals:live
 *
 * For mock-tagged cases, see evals/mock.eval.test.ts (npm run evals:mock) —
 * they need Vitest's module mocking, which a plain script can't do.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.local before importing anything that reads env vars.
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const [, key, raw] = match
    if (process.env[key]) continue
    process.env[key] = raw.replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

import { loadCases, filterByTag } from '../evals/lib/load-cases'
import { executeCase } from '../evals/lib/run-case'
import { printResultsTable, persistEvalRun } from '../evals/lib/report'
import { flushObservability } from '../lib/observability/langfuse'

async function main(): Promise<void> {
  const allCases = loadCases()
  const liveCases = filterByTag(allCases, 'live')

  if (liveCases.length === 0) {
    console.log('No live-tagged eval cases found — nothing to run.')
    process.exit(0)
  }

  for (const key of ['GROQ_API_KEY', 'TAVILY_API_KEY']) {
    if (!process.env[key]) {
      console.error(`Missing ${key} — add it to .env.local before running live evals.`)
      process.exit(1)
    }
  }

  console.log(`Running ${liveCases.length} live eval case(s) against real Groq/Tavily...`)

  const results = []
  for (const evalCase of liveCases) {
    const result = await executeCase(evalCase)
    results.push(result)
    console.log(`  ${result.pass ? 'PASS' : 'FAIL'}  ${evalCase.id}`)
  }

  printResultsTable(results, 'live')
  await persistEvalRun(results, 'live')
  await flushObservability()

  const allPassed = results.every((r) => r.pass)
  process.exit(allPassed ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error('Unhandled error running live evals:', error)
  process.exit(1)
})
