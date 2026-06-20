'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { AnalyticsResponse, WorkflowStat, StepFailure } from '@/app/api/analytics/route'

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return 'just now'
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`
}

function failureRateColor(rate: number): string {
  if (rate > 30) return 'text-red-400 bg-red-500/10'
  if (rate >= 10) return 'text-yellow-400 bg-yellow-500/10'
  return 'text-green-400 bg-green-500/10'
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      {children}
    </section>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="py-6 text-center text-sm text-gray-500">{message}</p>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => r.json())
      .then((d: AnalyticsResponse) => setData(d))
      .catch(() => {/* show empty states */})
      .finally(() => setLoading(false))
  }, [])

  const workflowStats: WorkflowStat[] = data?.workflowStats ?? []
  const stepFailures: StepFailure[] = data?.stepFailures ?? []

  // Prepare chart data — truncate long names so bars fit
  const runCountData = workflowStats.map((wf) => ({
    name: wf.name.length > 20 ? `${wf.name.slice(0, 18)}…` : wf.name,
    Runs: wf.runCount,
  }))

  const latencyData = workflowStats
    .filter((wf) => wf.avgLatencyMs > 0)
    .map((wf) => ({
      name: wf.name.length > 20 ? `${wf.name.slice(0, 18)}…` : wf.name,
      'Avg (s)': parseFloat((wf.avgLatencyMs / 1000).toFixed(1)),
    }))

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#1c1c1c] text-gray-100">
      <div className="mx-auto max-w-5xl px-6 py-16">
        {/* Header */}
        <Link href="/" className="text-sm text-gray-500 transition-colors hover:text-gray-300">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">Workflow Insights</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-400">
          Run counts, avg completion times, and step failure rates across all your workflows.
        </p>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
          Data updates as you run more workflows — each execution adds to the history below.
        </p>

        {loading ? (
          <div className="mt-12 flex items-center justify-center py-16 text-sm text-gray-500">
            Loading analytics…
          </div>
        ) : (
          <div className="mt-10 flex flex-col gap-6">

            {/* Section 1 — Run counts */}
            <Section title="Run counts">
              {runCountData.length === 0 ? (
                <EmptyState message="No runs recorded yet. Run a workflow to see data here." />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, runCountData.length * 44)}>
                  <BarChart layout="vertical" data={runCountData} margin={{ left: 16, right: 32, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 12 }} width={160} />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                      labelStyle={{ color: '#f3f4f6' }}
                      itemStyle={{ color: '#818cf8' }}
                    />
                    <Bar dataKey="Runs" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>

            {/* Section 2 — Avg completion time */}
            <Section title="Avg completion time">
              {latencyData.length === 0 ? (
                <EmptyState message="No completed runs yet." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={latencyData} margin={{ left: 8, right: 8, top: 4, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#d1d5db', fontSize: 12 }}
                      angle={-20}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} unit="s" />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                      labelStyle={{ color: '#f3f4f6' }}
                      itemStyle={{ color: '#34d399' }}
                      formatter={(v: unknown) => [typeof v === 'number' ? `${v}s` : String(v), 'Avg time']}
                    />
                    <Bar dataKey="Avg (s)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>

            {/* Section 3 — Step failure rates */}
            <Section title="Step failure rates">
              {stepFailures.length === 0 ? (
                <EmptyState message="No step data recorded yet." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      <th className="pb-2 pr-4">Step</th>
                      <th className="pb-2 pr-4 text-right">Total Runs</th>
                      <th className="pb-2 pr-4 text-right">Errors</th>
                      <th className="pb-2 text-right">Failure Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {stepFailures.map((s) => (
                      <tr key={s.nodeLabel}>
                        <td className="py-2.5 pr-4 font-medium text-gray-200">{s.nodeLabel}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-gray-400">{s.totalRuns}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-gray-400">{s.errorCount}</td>
                        <td className="py-2.5 text-right">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${failureRateColor(s.failureRate)}`}>
                            {s.failureRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Section 4 — Last run */}
            <Section title="Last run per workflow">
              {workflowStats.length === 0 ? (
                <EmptyState message="No runs recorded yet." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      <th className="pb-2 pr-4">Workflow</th>
                      <th className="pb-2 pr-4 text-right">Runs</th>
                      <th className="pb-2 text-right">Last Run</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {workflowStats.map((wf) => (
                      <tr key={wf.name}>
                        <td className="py-2.5 pr-4 font-medium text-gray-200">{wf.name}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-gray-400">{wf.runCount}</td>
                        <td className="py-2.5 text-right text-gray-400">
                          {wf.lastRun ? timeAgo(wf.lastRun) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

          </div>
        )}

        {/* Footer nav */}
        <nav className="mt-12 flex gap-6 border-t border-gray-800 pt-8 text-sm text-gray-500">
          <Link href="/templates" className="hover:text-gray-300">Templates</Link>
          <Link href="/library" className="hover:text-gray-300">Library</Link>
          <Link href="/how-it-works" className="hover:text-gray-300">How it works</Link>
          <Link href="/eval" className="hover:text-gray-300">Eval Runner</Link>
        </nav>
      </div>
    </div>
  )
}
