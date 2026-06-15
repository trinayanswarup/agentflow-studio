import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { WorkflowRunner } from '@/lib/engine/runner'
import { callLLM } from '@/lib/llm/groq'
import { scoreExactMatch, scoreContains } from '@/lib/eval/scoring'
import type { WorkflowDefinition } from '@/lib/types'

// ── Request validation ────────────────────────────────────────────────────────

const evalRequestSchema = z.object({
  workflowId: z.string().uuid(),
  testCases: z
    .array(
      z.object({
        input: z.string().min(1),
        expected: z.string().min(1),
      })
    )
    .min(1)
    .max(20),
  scoringStrategy: z.enum(['exact_match', 'contains', 'llm_judge']),
})

type ScoringStrategy = 'exact_match' | 'contains' | 'llm_judge'

export type EvalResult = {
  input: string
  expected: string
  output: string
  score: number
  pass: boolean
  latencyMs: number
  tokens: number
  reasoning?: string
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.name === 'string' && Array.isArray(v.nodes) && Array.isArray(v.edges)
}


async function scoreLlmJudge(
  actual: string,
  expected: string
): Promise<{ score: number; pass: boolean; reasoning: string }> {
  try {
    const result = await callLLM({
      system:
        'You are a strict quality evaluator. Respond with only valid JSON, no markdown: {"score": <integer 1-10>, "reasoning": "<one sentence>"}. 1=completely wrong, 10=perfect match.',
      prompt: `Criterion: ${expected}\n\nOutput to evaluate:\n"""\n${actual.slice(0, 2000)}\n"""`,
    })
    const start = result.text.indexOf('{')
    const end = result.text.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('No JSON in judge response')
    const parsed = JSON.parse(result.text.slice(start, end + 1)) as {
      score?: unknown
      reasoning?: unknown
    }
    const score = Math.min(10, Math.max(1, Math.round(Number(parsed.score) || 5)))
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : ''
    return { score, pass: score >= 7, reasoning }
  } catch {
    return { score: 0, pass: false, reasoning: 'Judge failed' }
  }
}

async function runTestCase(
  definition: WorkflowDefinition,
  input: string,
  expected: string,
  strategy: ScoringStrategy
): Promise<EvalResult> {
  const started = Date.now()
  let output = ''
  let tokens = 0
  let runError: string | undefined

  try {
    const runner = new WorkflowRunner(definition)
    const result = await runner.run(input)
    output = result.output
    tokens = result.totalTokens
    if (result.status === 'failed') {
      runError = output || 'Run failed with no output'
    }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err)
  }

  const latencyMs = Date.now() - started

  if (runError) {
    return { input, expected, output, score: 0, pass: false, latencyMs, tokens, error: runError }
  }

  let score = 0
  let pass = false
  let reasoning: string | undefined

  if (strategy === 'exact_match') {
    const s = scoreExactMatch(output, expected)
    score = s.score
    pass = s.pass
  } else if (strategy === 'contains') {
    const s = scoreContains(output, expected)
    score = s.score
    pass = s.pass
  } else {
    const s = await scoreLlmJudge(output, expected)
    score = s.score
    pass = s.pass
    reasoning = s.reasoning
  }

  return {
    input,
    expected,
    output,
    score,
    pass,
    latencyMs,
    tokens,
    ...(reasoning !== undefined ? { reasoning } : {}),
  }
}

// Worker-pool pattern: true concurrency limit (not batched).
async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++
      if (index >= tasks.length) break
      results[index] = await tasks[index]()
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  )
  return results
}

// ── POST /api/eval ────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = evalRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }

  const { workflowId, testCases, scoringStrategy } = parsed.data

  const supabase = createServerClient()
  const { data: workflowRow, error: dbError } = await supabase
    .from('workflows')
    .select('id, definition_json')
    .eq('id', workflowId)
    .single()

  if (dbError || !workflowRow) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  }

  if (!isWorkflowDefinition(workflowRow.definition_json)) {
    return NextResponse.json({ error: 'Workflow definition is invalid' }, { status: 422 })
  }

  const definition = workflowRow.definition_json

  const tasks = testCases.map(
    (tc) => () => runTestCase(definition, tc.input, tc.expected, scoringStrategy)
  )
  const results = await runWithConcurrencyLimit(tasks, 3)

  // Store each test case as a run in Supabase (fire and forget).
  for (const result of results) {
    void supabase
      .from('runs')
      .insert({
        workflow_id: workflowId,
        input: result.input,
        status: 'eval',
        completed_at: new Date().toISOString(),
      })
      .then(() => undefined)
  }

  return NextResponse.json({ results })
}
