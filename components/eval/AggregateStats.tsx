'use client'

type EvalResultSlice = {
  score: number
  pass: boolean
  latencyMs: number
  tokens: number
}

interface Props {
  results: EvalResultSlice[]
}

export function AggregateStats({ results }: Props) {
  if (results.length === 0) return null

  const passCount = results.filter((r) => r.pass).length
  const passRate = Math.round((passCount / results.length) * 100)
  const avgScore = (results.reduce((s, r) => s + r.score, 0) / results.length).toFixed(1)
  const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)
  const totalTokens = results.reduce((s, r) => s + r.tokens, 0)

  const stats = [
    {
      label: 'Pass Rate',
      value: `${passRate}%`,
      sub: `${passCount} / ${results.length} passed`,
      color: passRate >= 70 ? 'text-green-300' : passRate >= 40 ? 'text-yellow-300' : 'text-red-300',
    },
    { label: 'Avg Score', value: avgScore, sub: 'out of 10', color: 'text-white' },
    {
      label: 'Avg Latency',
      value: `${avgLatency.toLocaleString()}ms`,
      sub: 'per case',
      color: 'text-white',
    },
    {
      label: 'Total Tokens',
      value: totalTokens.toLocaleString(),
      sub: 'across all cases',
      color: 'text-white',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded border border-gray-800 bg-gray-900 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {s.label}
          </div>
          <div className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</div>
          <div className="text-[11px] text-gray-500">{s.sub}</div>
        </div>
      ))}
    </div>
  )
}
