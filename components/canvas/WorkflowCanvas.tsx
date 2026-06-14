'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

// ── Inner canvas — must be inside ReactFlowProvider to use useReactFlow ───────

interface InnerProps {
  initialDefinition: WorkflowDefinition | undefined
  initialName: string
}

function WorkflowCanvasInner({ initialDefinition, initialName }: InnerProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  const router = useRouter()

  const initial = initialDefinition ? deserializeWorkflow(initialDefinition) : null
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeData>(initial?.nodes ?? [])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial?.edges ?? [])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [workflowName, setWorkflowName] = useState(initialName)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null

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
      const saved = await res.json() as { workflow: { id: string } }
      setSaveStatus('saved')
      // Navigate to the run page after a brief visual confirmation.
      setTimeout(() => router.push(`/run/${saved.workflow.id}`), 800)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const SAVE_LABEL: Record<string, string> = {
    idle: 'Save',
    saving: 'Saving…',
    saved: '✓ Saved',
    error: 'Error — retry',
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-gray-800 bg-gray-950 px-4">
        <input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-100 transition-colors focus:border-accent-500 focus:outline-none"
          placeholder="Workflow name"
        />
        <button
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
        <span className="ml-auto flex items-center gap-4 text-[11px] text-gray-500">
          <a href="/how-it-works" className="hover:text-gray-300">How it works</a>
          <span>{nodes.length} nodes · {edges.length} edges</span>
        </span>
      </div>

      {/* 3-panel body */}
      <div className="flex flex-1 overflow-hidden">
        <NodeSidebar />

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="relative flex-1">
          {/* Empty state — shown when no nodes have been placed yet */}
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
              <p className="text-sm text-gray-500">
                Drag a node from the left to start — or load a template
              </p>
              <a
                href="/templates"
                className="pointer-events-auto rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
              >
                Browse Templates
              </a>
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
}

export default function WorkflowCanvas({
  initialDefinition,
  initialName = 'My Workflow',
}: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner initialDefinition={initialDefinition} initialName={initialName} />
    </ReactFlowProvider>
  )
}
