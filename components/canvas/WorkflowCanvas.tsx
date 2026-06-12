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
  type AgentEdge,
  type AgentNodeData,
  DEFAULT_CONFIGS,
  NODE_LABELS,
  serializeWorkflow,
} from './types'
import { nodeTypes } from './nodes'
import { NodeSidebar } from './NodeSidebar'
import { NodeConfigPanel } from './NodeConfigPanel'

// ── Demo workflow — Lead Enrichment Pipeline ──────────────────────────────────

const DEMO_NODES: AgentNode[] = [
  {
    id: 'input_1',
    type: 'input',
    position: { x: 280, y: 0 },
    data: { label: 'Company Name', config: { placeholder: 'e.g. Nord Security' } },
  },
  {
    id: 'search_1',
    type: 'tool_call',
    position: { x: 280, y: 120 },
    data: {
      label: 'Web Search',
      config: {
        toolName: 'web_search',
        args: { query: '{{input_1_output}} company overview site:linkedin.com OR crunchbase.com' },
      },
    },
  },
  {
    id: 'extract_1',
    type: 'llm_call',
    position: { x: 280, y: 240 },
    data: {
      label: 'Extract Profile',
      config: {
        system:
          'You are a data extraction assistant. Return valid JSON only — no markdown, no prose. Use the web_fetch tool to read a URL from the search results if you need more detail.',
        prompt:
          'Extract company name, industry, employee count, headquarters, and a one-sentence description from the search results below. Return as JSON.\n\nSearch results:\n{{search_1_output}}',
        tools: ['web_fetch'],
      },
    },
  },
  {
    id: 'email_1',
    type: 'llm_call',
    position: { x: 280, y: 380 },
    data: {
      label: 'Write Email',
      config: {
        system: 'You are an expert B2B sales copywriter. Write concise, personalized outreach emails — no generic filler.',
        prompt:
          'Write a personalized cold outreach email (max 150 words) for a sales rep reaching out to this company. Use the profile below to make it specific.\n\nCompany profile:\n{{extract_1_output}}',
        tools: [],
      },
    },
  },
  {
    id: 'review_1',
    type: 'human_pause',
    position: { x: 280, y: 520 },
    data: {
      label: 'Human Review',
      config: { message: 'Review the draft email before it is finalized.' },
    },
  },
  {
    id: 'output_1',
    type: 'output',
    position: { x: 280, y: 640 },
    data: {
      label: 'Final Output',
      config: {
        template: '{{email_1_output}}\n\n---\nCompany profile:\n{{extract_1_output}}',
      },
    },
  },
]

const DEMO_EDGES: AgentEdge[] = [
  { id: 'e1', source: 'input_1', target: 'search_1' },
  { id: 'e2', source: 'search_1', target: 'extract_1' },
  { id: 'e3', source: 'extract_1', target: 'email_1' },
  { id: 'e4', source: 'email_1', target: 'review_1' },
  { id: 'e5', source: 'review_1', target: 'output_1' },
]

// ── Inner canvas — must be inside ReactFlowProvider to use useReactFlow ───────

interface InnerProps {
  initialDemo: boolean
  initialName: string
}

function WorkflowCanvasInner({ initialDemo, initialName }: InnerProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  const router = useRouter()

  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeData>(
    initialDemo ? DEMO_NODES : []
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialDemo ? DEMO_EDGES : [])
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
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white focus:border-gray-500 focus:outline-none"
          placeholder="Workflow name"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={`rounded px-4 py-1 text-sm font-medium transition-colors ${
            saveStatus === 'saved'
              ? 'bg-green-700 text-white'
              : saveStatus === 'error'
              ? 'bg-red-700 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
          }`}
        >
          {SAVE_LABEL[saveStatus]}
        </button>
        <span className="ml-auto text-[11px] text-gray-500">
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>

      {/* 3-panel body */}
      <div className="flex flex-1 overflow-hidden">
        <NodeSidebar />

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1">
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
            fitView={initialDemo}
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

        <NodeConfigPanel node={selectedNode} onUpdate={updateNodeData} />
      </div>
    </div>
  )
}

// ── Public export — wraps inner canvas with ReactFlowProvider ─────────────────

interface WorkflowCanvasProps {
  initialDemo?: boolean
  initialName?: string
}

export default function WorkflowCanvas({
  initialDemo = false,
  initialName = 'My Workflow',
}: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner initialDemo={initialDemo} initialName={initialName} />
    </ReactFlowProvider>
  )
}
