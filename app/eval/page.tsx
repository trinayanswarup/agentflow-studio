'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EvalResultsTable, type EvalResult } from '@/components/eval/EvalResultsTable'
import { AggregateStats } from '@/components/eval/AggregateStats'

type Workflow = { id: string; name: string; created_at: string }
type ScoringStrategy = 'exact_match' | 'contains' | 'llm_judge'

const DEFAULT_TEST_CASES = JSON.stringify(
  [
    { input: 'Nord Security', expected: 'cybersecurity' },
    { input: 'Revolut', expected: 'fintech' },
    { input: 'Spotify', expected: 'music streaming' },
  ],
  null,
  2
)

const STRATEGIES: { value: ScoringStrategy; label: string; hint: string }[] = [
  { value: 'exact_match', label: 'Exact Match', hint: 'Output must equal expected (case-insensitive)' },
  { value: 'contains', label: 'Contains', hint: 'Output must contain expected string' },
  { value: 'llm_judge', label: 'LLM Judge', hint: 'Groq scores 0–10, pass if ≥ 7' },
]

export default function EvalPage() {
  const router = useRouter()

  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loadingWorkflows, setLoadingWorkflows] = useState(true)
  const [workflowFetchError, setWorkflowFetchError] = useState<string | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [strategy, setStrategy] = useState<ScoringStrategy>('contains')
  const [testCasesJson, setTestCasesJson] = useState(DEFAULT_TEST_CASES)
  const [results, setResults] = useState<EvalResult[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function loadWorkflows() {
      try {
        const res = await fetch('/api/workflows')
        const data = (await res.json()) as { workflows?: Workflow[]; error?: string }
        if (!res.ok) {
          setWorkflowFetchError(data.error ?? `HTTP ${res.status}`)
          return
        }
        const wfs = data.workflows ?? []
        setWorkflows(wfs)
        if (wfs.length > 0) setSelectedWorkflowId(wfs[0].id)
      } catch (err) {
        setWorkflowFetchError(err instanceof Error ? err.message : 'Failed to load workflows')
      } finally {
        setLoadingWorkflows(false)
      }
    }
    void loadWorkflows()
  }, [])

  async function handleRunEvals() {
    if (!selectedWorkflowId || status === 'running') return

    let testCases: unknown
    try {
      testCases = JSON.parse(testCasesJson)
    } catch {
      setErrorMsg('Test cases is not valid JSON.')
      setStatus('error')
      return
    }

    setStatus('running')
    setResults(null)
    setErrorMsg('')

    try {
      const res = await fetch('/api/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: selectedWorkflowId,
          testCases,
          scoringStrategy: strategy,
        }),
      })
      const data = (await res.json()) as { results?: EvalResult[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResults(data.results ?? [])
      setStatus('idle')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const isRunning = status === 'running'

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <div className="flex h-12 items-center gap-3 border-b border-gray-800 bg-gray-950 px-4">
        <button
          type="button"
          onClick={() => router.push('/editor')}
          className="text-sm text-gray-400 hover:text-gray-200"
        >
          ← Editor
        </button>
        <span className="text-sm font-semibold text-gray-200">Eval Runner</span>
      </div>

      <div className="mx-auto max-w-5xl p-6">
        {/* Config panel */}
        <div className="mb-6 rounded border border-gray-800 bg-gray-900 p-5">
          <div className="mb-4 flex flex-wrap items-end gap-6">
            {/* Workflow selector */}
            <div className="min-w-[200px] flex-1">
              <label
                htmlFor="workflow-select"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400"
              >
                Workflow
              </label>
              {loadingWorkflows ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : workflowFetchError ? (
                <p className="text-sm text-red-400">{workflowFetchError}</p>
              ) : workflows.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No saved workflows.{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/editor')}
                    className="text-blue-400 underline hover:text-blue-300"
                  >
                    Build one in the Editor.
                  </button>
                </p>
              ) : (
                <select
                  id="workflow-select"
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-gray-500 focus:outline-none"
                >
                  {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Scoring strategy */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Scoring Strategy
              </label>
              <div className="flex gap-2">
                {STRATEGIES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStrategy(s.value)}
                    title={s.hint}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                      strategy === s.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                {STRATEGIES.find((s) => s.value === strategy)?.hint}
              </p>
            </div>
          </div>

          {/* Test cases textarea */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Test Cases (JSON)
            </label>
            <textarea
              value={testCasesJson}
              onChange={(e) => setTestCasesJson(e.target.value)}
              rows={12}
              spellCheck={false}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
              placeholder='[{"input": "...", "expected": "..."}]'
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Format:{' '}
              <span className="font-mono">
                {`[{"input": "...", "expected": "..."}]`}
              </span>
              {' '}· Max 20 cases.
            </p>
          </div>

          {/* Error banner */}
          {status === 'error' && (
            <div className="mb-3 rounded border border-red-800 bg-red-950 px-4 py-2 text-sm text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Run button */}
          <button
            type="button"
            onClick={handleRunEvals}
            disabled={isRunning || !selectedWorkflowId || workflows.length === 0}
            className="rounded bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Running Evals…
              </span>
            ) : (
              'Run Evals'
            )}
          </button>
          {isRunning && (
            <p className="mt-2 text-xs text-gray-500">
              Running up to 3 cases concurrently. This may take a minute…
            </p>
          )}
        </div>

        {/* Results */}
        {results !== null && results.length > 0 && (
          <div className="space-y-4">
            <AggregateStats results={results} />
            <EvalResultsTable results={results} />
          </div>
        )}

        {results !== null && results.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No results returned.</p>
        )}
      </div>
    </div>
  )
}
