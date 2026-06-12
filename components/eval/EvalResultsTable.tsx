'use client'

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

interface Props {
  results: EvalResult[]
}

export function EvalResultsTable({ results }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-gray-800">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900">
            {['Input', 'Expected', 'Actual Output', 'Score', 'Pass/Fail', 'Latency'].map((h) => (
              <th
                key={h}
                className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr
              key={i}
              className={`border-b border-gray-800 ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900'}`}
            >
              {/* Input */}
              <td className="max-w-[160px] px-4 py-3">
                <span className="block truncate text-gray-300" title={r.input}>
                  {r.input}
                </span>
              </td>

              {/* Expected */}
              <td className="max-w-[160px] px-4 py-3">
                <span className="block truncate text-gray-400" title={r.expected}>
                  {r.expected}
                </span>
              </td>

              {/* Actual output */}
              <td className="max-w-[280px] px-4 py-3">
                {r.error ? (
                  <span className="text-xs text-red-400">{r.error}</span>
                ) : (
                  <span className="text-xs text-gray-300" title={r.output}>
                    {r.output.length > 150 ? `${r.output.slice(0, 150)}…` : r.output}
                  </span>
                )}
                {r.reasoning && (
                  <div className="mt-0.5 text-[10px] text-gray-500" title={r.reasoning}>
                    Judge: {r.reasoning}
                  </div>
                )}
              </td>

              {/* Score */}
              <td className="px-4 py-3 text-center font-semibold text-gray-200">
                {r.score}
                <span className="font-normal text-gray-500">/10</span>
              </td>

              {/* Pass/Fail */}
              <td className="px-4 py-3">
                {r.pass ? (
                  <span className="rounded bg-green-900 px-2 py-0.5 text-xs font-semibold text-green-300">
                    PASS
                  </span>
                ) : (
                  <span className="rounded bg-red-900 px-2 py-0.5 text-xs font-semibold text-red-300">
                    FAIL
                  </span>
                )}
              </td>

              {/* Latency */}
              <td className="px-4 py-3 text-gray-400">
                {r.latencyMs.toLocaleString()}ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
