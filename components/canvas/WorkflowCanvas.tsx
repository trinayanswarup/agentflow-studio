'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { GuidedTour } from '@/components/onboarding/GuidedTour'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { NodeType } from '@/lib/types'
import {
  type AgentNode,
  type AgentNodeData,
  DEFAULT_CONFIGS,
  NODE_LABELS,
  serializeWorkflow,
  deserializeWorkflow,
} from './types'
import type { WorkflowDefinition } from '@/lib/types'
import { nodeTypes } from './nodes'
import { NodeSidebar } from './NodeSidebar'
import { NodeConfigPanel } from './NodeConfigPanel'

interface NlResult {
  workflowId: string
  name: string
  content: string
  score: number
}

// ── Inner canvas — must be inside ReactFlowProvider to use useReactFlow ───────

interface InnerProps {
  initialDefinition: WorkflowDefinition | undefined
  initialName: string
  showTour: boolean
  initialWorkflowId?: string
}

function WorkflowCanvasInner({ initialDefinition, initialName, showTour, initialWorkflowId }: InnerProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const initial = initialDefinition ? deserializeWorkflow(initialDefinition) : null
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeData>(initial?.nodes ?? [])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial?.edges ?? [])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [workflowName, setWorkflowName] = useState(initialName)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedWorkflowId, setSavedWorkflowId] = useState<string | null>(initialWorkflowId ?? null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [copied, setCopied] = useState(false)
  const [tourVisible, setTourVisible] = useState<boolean>(showTour)
  const [nlQuery, setNlQuery] = useState('')
  const [nlResults, setNlResults] = useState<NlResult[] | null>(null)
  const [nlLoading, setNlLoading] = useState(false)

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null

  // Pre-load a workflow imported from the documents page (cross-page sessionStorage handoff)
  useEffect(() => {
    const raw = sessionStorage.getItem('importedWorkflow')
    if (!raw) return
    sessionStorage.removeItem('importedWorkflow')
    try {
      const definition = JSON.parse(raw) as WorkflowDefinition
      const deserialized = deserializeWorkflow(definition)
      setNodes(deserialized.nodes)
      setEdges(deserialized.edges)
      if (definition.name) setWorkflowName(definition.name)
    } catch {
      // ignore malformed data
    }
  }, [setNodes, setEdges, setWorkflowName])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: 'smoothstep' }, eds))
    },
    [setEdges]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<AgentNodeData>) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const nodeType = e.dataTransfer.getData('application/reactflow') as NodeType
      if (!nodeType) return

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const newNode: AgentNode = {
        id: crypto.randomUUID(),
        type: nodeType,
        position,
        data: {
          label: NODE_LABELS[nodeType],
          config: { ...DEFAULT_CONFIGS[nodeType] },
        },
      }
      setNodes((nds) => [...nds, newNode])
    },
    [screenToFlowPosition, setNodes]
  )

  const updateNodeData = useCallback(
    (nodeId: string, label: string, config: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label, config } } : n))
      )
    },
    [setNodes]
  )

  async function handleNlSuggest() {
    if (!nlQuery.trim() || nlLoading) return
    setNlLoading(true)
    try {
      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlQuery.trim() }),
      })
      const data = (await res.json()) as { results?: NlResult[] }
      setNlResults(data.results?.slice(0, 3) ?? [])
    } catch {
      setNlResults([])
    } finally {
      setNlLoading(false)
    }
  }

  async function handleSave() {
    setSaveStatus('saving')
    const definition = serializeWorkflow(workflowName, nodes, edges)
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: definition.name, definition_json: definition }),
      })
      if (!res.ok) throw new Error(await res.text())
      const saved = (await res.json()) as { workflow: { id: string } }
      setSavedWorkflowId(saved.workflow.id)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  function handleExport() {
    const definition = serializeWorkflow(workflowName, nodes, edges)
    const blob = new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflowName.replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleShare() {
    if (!savedWorkflowId) return
    setShareStatus('loading')
    try {
      const res = await fetch(`/api/workflows/${savedWorkflowId}/share`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const { url } = (await res.json()) as { slug: string; url: string }
      setShareUrl(url)
      setShareModalOpen(true)
      setShareStatus('idle')
    } catch {
      setShareStatus('error')
      setTimeout(() => setShareStatus('idle'), 3000)
    }
  }

  function handleCopy() {
    if (!shareUrl) return
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const SAVE_LABEL: Record<string, string> = {
    idle: 'Save',
    saving: 'Saving…',
    saved: '✓ Saved',
    error: 'Error — retry',
  }

  return (
    <div className="flex h-full flex-col">
      {tourVisible && <GuidedTour onClose={() => setTourVisible(false)} />}

      {/* Share modal */}
      {shareModalOpen && shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
            <h2 className="mb-1 text-base font-semibold text-gray-100">Share this workflow</h2>
            <p className="mb-4 text-xs text-gray-400">Anyone with this link can view the workflow in read-only mode.</p>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
              <span className="flex-1 truncate text-xs text-gray-300">{shareUrl}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
              >
                {copied ? '✓ Copied!' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={() => { setShareModalOpen(false); setCopied(false) }}
                className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-950 px-4">
        <input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-100 transition-colors focus:border-accent-500 focus:outline-none"
          placeholder="Workflow name"
        />
        <button
          data-tour="save-btn"
          type="button"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
            saveStatus === 'saved'
              ? 'bg-green-600 text-white'
              : saveStatus === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-accent-600 text-white hover:bg-accent-500 disabled:opacity-50'
          }`}
        >
          {SAVE_LABEL[saveStatus]}
        </button>
        {savedWorkflowId && (
          <a
            href={`/run/${savedWorkflowId}`}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700"
          >
            → Run
          </a>
        )}
        <button
          type="button"
          onClick={handleExport}
          title="Download workflow as JSON"
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700"
        >
          Export
        </button>
        <button
          type="button"
          onClick={handleShare}
          disabled={!savedWorkflowId || shareStatus === 'loading'}
          title={savedWorkflowId ? 'Generate a shareable link' : 'Save first to share'}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {shareStatus === 'loading' ? 'Sharing…' : shareStatus === 'error' ? 'Error' : 'Share'}
        </button>
        <span className="ml-auto flex items-center gap-4 text-[11px] text-gray-500">
          <a href="/how-it-works" className="hover:text-gray-300">How it works</a>
          <a href="/" className="hover:text-gray-300">Home</a>
          <span>{nodes.length} nodes · {edges.length} edges</span>
        </span>
      </div>

      {/* 3-panel body */}
      <div className="flex flex-1 overflow-hidden">
        <NodeSidebar />

        {/* Canvas */}
        <div data-tour="canvas" ref={reactFlowWrapper} className="relative flex-1">
          {/* Footer stats bar — floats above the canvas */}
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-lg border border-gray-800/30 bg-gray-950/40 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                ● {nodes.length} Nodes
              </span>
              <span className="h-3 w-px bg-gray-800/60" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                ● {edges.length} Connections
              </span>
            </div>
          </div>

          {/* Empty state — shown when no nodes have been placed yet */}
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-4">
              <p className="text-sm text-gray-500">
                Drag a node from the left to start — or load a template
              </p>
              <a
                href="/templates"
                className="pointer-events-auto rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
              >
                Browse Templates
              </a>

              {/* NL suggestion */}
              <div className="pointer-events-auto mt-2 flex w-80 flex-col gap-2">
                <p className="text-center text-xs text-gray-600">Or describe what you want to automate</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nlQuery}
                    onChange={(e) => setNlQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleNlSuggest() }}
                    placeholder="e.g. qualify B2B leads automatically"
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:border-accent-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleNlSuggest()}
                    disabled={nlLoading || !nlQuery.trim()}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
                  >
                    {nlLoading ? '…' : 'Suggest'}
                  </button>
                </div>

                {nlResults !== null && nlResults.length === 0 && (
                  <p className="text-center text-[11px] text-gray-600">
                    No saved workflows matched. Try saving a template first.
                  </p>
                )}

                {nlResults !== null && nlResults.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {nlResults.map((r) => (
                      <div
                        key={r.workflowId}
                        className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-gray-200">{r.name}</p>
                          <p className="text-[10px] text-gray-500">{(r.score * 100).toFixed(1)}% match</p>
                        </div>
                        <a
                          href={`/editor?workflow=${r.workflowId}`}
                          className="ml-3 flex-shrink-0 rounded-lg bg-accent-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-accent-500"
                        >
                          Use this
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView={!!initialDefinition}
            deleteKeyCode="Delete"
            className="bg-gray-950"
          >
            <Background color="#374151" gap={20} size={1} />
            <Controls className="!border-gray-700 !bg-gray-900 !text-gray-300" />
            <MiniMap
              nodeColor={(n) => {
                const type = n.type as NodeType
                const colors: Record<NodeType, string> = {
                  input: '#3b82f6',
                  llm_call: '#a855f7',
                  tool_call: '#f97316',
                  condition: '#eab308',
                  human_pause: '#ef4444',
                  output: '#22c55e',
                }
                return colors[type] ?? '#6b7280'
              }}
              className="!border-gray-700 !bg-gray-900"
            />
          </ReactFlow>
        </div>

        <NodeConfigPanel node={selectedNode} onUpdate={updateNodeData} nodes={nodes} />
      </div>
    </div>
  )
}

// ── Public export — wraps inner canvas with ReactFlowProvider ─────────────────

interface WorkflowCanvasProps {
  initialDefinition?: WorkflowDefinition
  initialName?: string
  showTour?: boolean
  initialWorkflowId?: string
}

export default function WorkflowCanvas({
  initialDefinition,
  initialName = 'My Workflow',
  showTour = false,
  initialWorkflowId,
}: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner
        initialDefinition={initialDefinition}
        initialName={initialName}
        showTour={showTour}
        initialWorkflowId={initialWorkflowId}
      />
    </ReactFlowProvider>
  )
}
