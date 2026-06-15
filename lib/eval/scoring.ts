export type ScoringStrategy = 'exact_match' | 'contains'

export type ScoringResult = { score: number; pass: boolean }

export function scoreExactMatch(actual: string, expected: string): ScoringResult {
  const pass = actual.trim().toLowerCase() === expected.trim().toLowerCase()
  return { score: pass ? 10 : 0, pass }
}

export function scoreContains(actual: string, expected: string): ScoringResult {
  const pass = actual.toLowerCase().includes(expected.toLowerCase())
  return { score: pass ? 10 : 0, pass }
}

export function score(
  actual: string,
  expected: string,
  strategy: ScoringStrategy
): ScoringResult {
  switch (strategy) {
    case 'exact_match':
      return scoreExactMatch(actual, expected)
    case 'contains':
      return scoreContains(actual, expected)
  }
}
