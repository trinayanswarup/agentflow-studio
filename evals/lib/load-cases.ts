import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evalCaseSchema, type EvalCase } from './types'

const DEFAULT_CASES_DIR = join(process.cwd(), 'evals', 'cases')

export function loadCases(dir: string = DEFAULT_CASES_DIR): EvalCase[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    throw new Error(`No eval case files found in ${dir}`)
  }

  const cases = files.map((file) => {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch (error) {
      throw new Error(`Failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
    const parsed = evalCaseSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Invalid eval case in ${file}: ${parsed.error.message}`)
    }
    return parsed.data
  })

  const ids = new Set<string>()
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`Duplicate eval case id "${c.id}"`)
    ids.add(c.id)
  }

  return cases
}

export function filterByTag(cases: EvalCase[], tag: 'mock' | 'live'): EvalCase[] {
  return cases.filter((c) => c.tags.includes(tag))
}
