'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import 'reactflow/dist/style.css'
import type { WorkflowDefinition, StepStatus } from '@/lib/types'
import { nodeTypes } from '@/components/canvas/nodes'
import type { AgentNodeData } from '@/components/canvas/types'
import { useWorkflowExecution } from '@/hooks/useWorkflowExecution'
import { TracePanel } from '@/components/trace/TracePanel'
import { NodeStateLegend } from '@/components/canvas/NodeStateLegend'

// ── Highlight styles for execution state ─────────────────────────────────────

const HIGHLIGHT: Record<StepStatus, React.CSSProperties> = {
  running: { boxShadow: '0 0 0 3px #eab308, 0 0 16px rgba(234,179,8,0.45)', borderRadius: '0.75rem' },
  done:    { boxShadow: '0 0 0 3px #22c55e', borderRadius: '0.75rem' },
  error:   { boxShadow: '0 0 0 3px #ef4444', borderRadius: '0.75rem' },
  waiting: { boxShadow: '0 0 0 3px #6366f1, 0 0 16px rgba(99,102,241,0.5)', borderRadius: '0.75rem' },
}

// ── Read-only canvas ──────────────────────────────────────────────────────────

interface ReadOnlyCanvasProps {
  workflow: WorkflowDefinition
  nodeStates: Map<string, StepStatus>
}

function ReadOnlyCanvas({ workflow, nodeStates }: ReadOnlyCanvasProps) {
  const rfNodes = useMemo(
    () =>
      workflow.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position ?? { x: 0, y: 0 },
        data: { label: n.label, config: n.config as Record<string, unknown> } satisfies AgentNodeData,
        style: nodeStates.has(n.id) ? HIGHLIGHT[nodeStates.get(n.id)!] : undefined,
        draggable: false,
        selectable: false,
        connectable: false,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflow, nodeStates]
  )

  const rfEdges = useMemo(
    () =>
      workflow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        type: 'smoothstep',
      })),
    [workflow]
  )

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll
      className="bg-gray-950"
    >
      <Background color="#374151" gap={20} size={1} />
      <Controls className="!border-gray-700 !bg-gray-900 !text-gray-300" />
      <MiniMap
        nodeColor={(n) => {
          const status = nodeStates.get(n.id)
          if (status === 'running') return '#eab308'
          if (status === 'done') return '#22c55e'
          if (status === 'error') return '#ef4444'
          if (status === 'waiting') return '#6366f1'
          return '#5b6475'
        }}
        className="!border-gray-700 !bg-gray-900"
      />
    </ReactFlow>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.name === 'string' && Array.isArray(v.nodes) && Array.isArray(v.edges)
}

// ── Run page ──────────────────────────────────────────────────────────────────

export default function RunPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null)
  const [workflowName, setWorkflowName] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    start,
    reset,
    nodeStates,
    traceEvents,
    finalOutput,
    runStatus,
    errorMessage,
    totalTokens,
    totalLatencyMs,
    runId,
    pendingHumanPause,
    clearPendingHumanPause,
  } = useWorkflowExecution()

  // Derive StepStatus map (node highlight state) from nodeStates
  const nodeHighlightMap = useMemo(() => {
    const m = new Map<string, StepStatus>()
    nodeStates.forEach((state, nodeId) => m.set(nodeId, state.status))
    return m
  }, [nodeStates])

  useEffect(() => {
    if (!id) return
    fetch(`/api/workflows/${id}`)
      .then((r) => r.json())
      .then((data: { workflow?: { name: string; definition_json: unknown }; error?: string }) => {
        if (data.error || !data.workflow) {
          setFetchError(data.error ?? 'Workflow not found')
          return
        }
        const def = data.workflow.definition_json
        if (!isWorkflowDefinition(def)) {
          setFetchError('Workflow definition is invalid')
          return
        }
        setWorkflow(def)
        setWorkflowName(data.workflow.name)
      })
      .catch((err: unknown) =>
        setFetchError(err instanceof Error ? err.message : 'Failed to load workflow')
      )
  }, [id])

  const handleRun = useCallback(() => {
    if (!id || !input.trim() || runStatus === 'running' || runStatus === 'starting') return
    void start(id, input.trim())
  }, [id, input, runStatus, start])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleRun()
    },
    [handleRun]
  )

  const handleRunAgain = useCallback(() => {
    reset()
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [reset])

  if (fetchError) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-red-400">
        <div className="text-center">
          <p className="mb-4 text-lg font-semibold">Failed to load workflow</p>
          <p className="mb-6 text-sm text-gray-400">{fetchError}</p>
          <button
            type="button"
            onClick={() => router.push('/editor')}
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
          >
            Go to Editor
          </button>
        </div>
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400 text-sm">
        Loading workflow…
      </div>
    )
  }

  const isRunning = runStatus === 'running' || runStatus === 'starting'

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      {/* Top bar */}
      <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-gray-800 bg-gray-950 px-4">
        <button
          type="button"
          onClick={() => router.push(`/editor`)}
          className="text-sm text-gray-400 hover:text-gray-200"
          title="Back to editor"
        >
          ← Editor
        </button>
        <span className="text-sm font-medium text-gray-200">{workflowName}</span>

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              (workflow.nodes.find((n) => n.type === 'input')?.config as { placeholder?: string })
                ?.placeholder ?? 'Enter input…'
            }
            disabled={isRunning}
            className="w-64 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-accent-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || !input.trim()}
            className="rounded-lg bg-accent-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runStatus === 'starting' ? 'Starting…' : runStatus === 'running' ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>

      {/* Node state legend */}
      <NodeStateLegend />

      {/* Error banner */}
      {errorMessage && (
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          <span>❌ {errorMessage}</span>
          {runStatus === 'failed' && runId && (
            <button
              type="button"
              onClick={() => router.push(`/agent?runId=${runId}`)}
              className="flex-shrink-0 rounded-lg border border-red-700 bg-red-900/40 px-3 py-1 text-xs font-semibold text-red-200 transition-colors hover:bg-red-900/70"
            >
              Investigate failure →
            </button>
          )}
        </div>
      )}

      {/* Main layout: canvas left, trace panel right */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 overflow-hidden">
          <ReadOnlyCanvas workflow={workflow} nodeStates={nodeHighlightMap} />
        </div>

        {/* Trace panel */}
        <div className="flex w-96 flex-shrink-0 flex-col border-l border-gray-800 bg-gray-950">
          <TracePanel
            events={traceEvents}
            finalOutput={finalOutput}
            runStatus={runStatus}
            totalTokens={totalTokens}
            totalLatencyMs={totalLatencyMs}
            runId={runId}
            pendingHumanPause={pendingHumanPause}
            onApprovalDecision={clearPendingHumanPause}
            onRunAgain={handleRunAgain}
            workflowId={id}
            workflowName={workflowName}
          />
        </div>
      </div>
    </div>
  )
}
