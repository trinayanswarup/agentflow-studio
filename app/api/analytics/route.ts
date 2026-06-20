import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export interface WorkflowStat {
  name: string
  runCount: number
  avgLatencyMs: number
  lastRun: string | null
}

export interface StepFailure {
  nodeLabel: string
  totalRuns: number
  errorCount: number
  failureRate: number
}

export interface AnalyticsResponse {
  workflowStats: WorkflowStat[]
  stepFailures: StepFailure[]
}

export async function GET() {
  const supabase = createServerClient()

  const [
    { data: workflows },
    { data: runs },
    { data: workflowRuns },
    { data: runSteps },
  ] = await Promise.all([
    supabase.from('workflows').select('id, name'),
    supabase.from('runs').select('workflow_id'),
    supabase.from('workflow_runs').select('workflow_id, started_at, completed_at'),
    supabase.from('run_steps').select('node_label, status'),
  ])

  // Build a name map from workflows
  const nameMap = new Map<string, string>()
  for (const wf of workflows ?? []) {
    nameMap.set(wf.id as string, wf.name as string)
  }

  // Count runs per workflow_id
  const runCounts = new Map<string, number>()
  for (const r of runs ?? []) {
    const id = r.workflow_id as string
    runCounts.set(id, (runCounts.get(id) ?? 0) + 1)
  }

  // Avg latency + last run from workflow_runs
  const latencyAcc = new Map<string, { total: number; count: number }>()
  const lastRunMap = new Map<string, string>()
  for (const wr of workflowRuns ?? []) {
    const id = wr.workflow_id as string
    const startedAt = wr.started_at as string | null
    const completedAt = wr.completed_at as string | null
    if (startedAt && completedAt) {
      const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
      const prev = latencyAcc.get(id) ?? { total: 0, count: 0 }
      latencyAcc.set(id, { total: prev.total + ms, count: prev.count + 1 })
    }
    if (startedAt) {
      const prev = lastRunMap.get(id)
      if (!prev || startedAt > prev) lastRunMap.set(id, startedAt)
    }
  }

  // Collect all workflow IDs that have any activity
  const activeIds = new Set([...runCounts.keys(), ...lastRunMap.keys()])

  const workflowStats: WorkflowStat[] = Array.from(activeIds)
    .map((id) => {
      const latency = latencyAcc.get(id)
      return {
        name: nameMap.get(id) ?? id,
        runCount: runCounts.get(id) ?? 0,
        avgLatencyMs: latency ? Math.round(latency.total / latency.count) : 0,
        lastRun: lastRunMap.get(id) ?? null,
      }
    })
    .sort((a, b) => b.runCount - a.runCount)

  // Aggregate step failures by node_label
  const stepAcc = new Map<string, { total: number; errors: number }>()
  for (const step of runSteps ?? []) {
    const label = step.node_label as string
    const prev = stepAcc.get(label) ?? { total: 0, errors: 0 }
    stepAcc.set(label, {
      total: prev.total + 1,
      errors: prev.errors + (step.status === 'error' ? 1 : 0),
    })
  }
  const stepFailures: StepFailure[] = Array.from(stepAcc.entries())
    .map(([nodeLabel, { total, errors }]) => ({
      nodeLabel,
      totalRuns: total,
      errorCount: errors,
      failureRate: total > 0 ? Math.round((errors / total) * 100) : 0,
    }))
    .sort((a, b) => b.errorCount - a.errorCount)

  const response: AnalyticsResponse = { workflowStats, stepFailures }
  return NextResponse.json(response)
}
