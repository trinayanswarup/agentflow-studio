'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StepStatus, TraceEvent } from '@/lib/types'

export type NodeExecutionState = {
  status: StepStatus
  latencyMs?: number
  tokens?: number
  output?: string
  error?: string
}

export type RunStatus = 'idle' | 'starting' | 'running' | 'completed' | 'failed'

export interface UseWorkflowExecutionResult {
  start: (workflowId: string, input: string) => Promise<void>
  nodeStates: Map<string, NodeExecutionState>
  traceEvents: TraceEvent[]
  finalOutput: string | null
  runStatus: RunStatus
  errorMessage: string | null
  totalTokens: number
  totalLatencyMs: number
}

export function useWorkflowExecution(): UseWorkflowExecutionResult {
  const [nodeStates, setNodeStates] = useState<Map<string, NodeExecutionState>>(new Map())
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([])
  const [finalOutput, setFinalOutput] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [totalTokens, setTotalTokens] = useState(0)
  const [totalLatencyMs, setTotalLatencyMs] = useState(0)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => () => { esRef.current?.close() }, [])

  function updateNodeState(nodeId: string, state: NodeExecutionState) {
    setNodeStates((prev) => {
      const next = new Map(prev)
      next.set(nodeId, state)
      return next
    })
  }

  const start = useCallback(async (workflowId: string, input: string) => {
    // Reset
    setNodeStates(new Map())
    setTraceEvents([])
    setFinalOutput(null)
    setErrorMessage(null)
    setTotalTokens(0)
    setTotalLatencyMs(0)
    setRunStatus('starting')

    let runId: string
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, input }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(body)
      }
      const data = await res.json() as { runId: string }
      runId = data.runId
    } catch (err) {
      setRunStatus('failed')
      setErrorMessage(err instanceof Error ? err.message : String(err))
      return
    }

    setRunStatus('running')
    esRef.current?.close()

    const es = new EventSource(`/api/stream/${runId}`)
    esRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as TraceEvent
      setTraceEvents((prev) => [...prev, event])

      switch (event.type) {
        case 'step_start':
          updateNodeState(event.nodeId, { status: 'running' })
          break
        case 'step_done':
          updateNodeState(event.nodeId, {
            status: 'done',
            latencyMs: event.latencyMs,
            tokens: event.tokens,
            output: event.output,
          })
          break
        case 'step_error':
          updateNodeState(event.nodeId, {
            status: 'error',
            latencyMs: event.latencyMs,
            error: event.error,
          })
          break
        case 'human_pause':
          updateNodeState(event.nodeId, { status: 'waiting' })
          break
        case 'run_complete':
          setFinalOutput(event.output)
          setTotalTokens(event.totalTokens)
          setTotalLatencyMs(event.totalLatencyMs)
          setRunStatus('completed')
          es.close()
          break
        case 'run_error':
          setErrorMessage(event.error)
          setRunStatus('failed')
          es.close()
          break
      }
    }

    es.onerror = () => {
      setRunStatus('failed')
      setErrorMessage('SSE connection lost')
      es.close()
    }
  }, [])

  return {
    start,
    nodeStates,
    traceEvents,
    finalOutput,
    runStatus,
    errorMessage,
    totalTokens,
    totalLatencyMs,
  }
}
