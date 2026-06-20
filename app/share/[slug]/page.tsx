'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import 'reactflow/dist/style.css'
import type { WorkflowDefinition } from '@/lib/types'
import { nodeTypes } from '@/components/canvas/nodes'
import type { AgentNodeData } from '@/components/canvas/types'
import { NODE_COLORS } from '@/components/canvas/types'

function isWorkflowDefinition(v: unknown): v is WorkflowDefinition {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return typeof r.name === 'string' && Array.isArray(r.nodes) && Array.isArray(r.edges)
}

export default function SharePage() {
  const { slug } = useParams<{ slug: string }>()
  const [name, setName] = useState<string>('')
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    fetch(`/api/share/${slug}`)
      .then((r) => r.json())
      .then((data: { name?: string; definition?: unknown; error?: string }) => {
        if (data.error || !data.definition) {
          setError(data.error ?? 'Workflow not found')
          return
        }
        if (!isWorkflowDefinition(data.definition)) {
          setError('Invalid workflow definition')
          return
        }
        setName(data.name ?? 'Shared Workflow')
        setDefinition(data.definition)
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load workflow')
      )
  }, [slug])

  const rfNodes = useMemo(
    () =>
      definition?.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position ?? { x: 0, y: 0 },
        data: { label: n.label, config: n.config as Record<string, unknown> } satisfies AgentNodeData,
        draggable: false,
        selectable: false,
        connectable: false,
      })) ?? [],
    [definition]
  )

  const rfEdges = useMemo(
    () =>
      definition?.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        type: 'smoothstep',
      })) ?? [],
    [definition]
  )

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-red-400">
        <div className="text-center">
          <p className="mb-2 text-lg font-semibold">Link not found</p>
          <p className="text-sm text-gray-400">{error}</p>
          <a
            href="/"
            className="mt-6 inline-block rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
          >
            Go Home
          </a>
        </div>
      </div>
    )
  }

  if (!definition) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400 text-sm">
        Loading workflow…
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      {/* Top bar */}
      <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-gray-800 bg-gray-950 px-4">
        <a href="/" className="flex-shrink-0 text-sm font-semibold tracking-tight text-gray-100 transition-colors hover:text-white">
          AgentFlow Studio
        </a>
        <span className="text-gray-700">/</span>
        <span className="truncate text-sm font-medium text-gray-200">{name}</span>
        <span className="flex-shrink-0 rounded-full border border-gray-700 bg-gray-800 px-2.5 py-0.5 text-[11px] text-gray-400">
          read only
        </span>
        <a
          href="/templates"
          className="ml-auto flex-shrink-0 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-500"
        >
          Build your own →
        </a>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
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
            nodeColor={(n) => NODE_COLORS[(n.type as keyof typeof NODE_COLORS)] ?? '#5b6475'}
            className="!border-gray-700 !bg-gray-900"
          />
        </ReactFlow>
      </div>
    </div>
  )
}
