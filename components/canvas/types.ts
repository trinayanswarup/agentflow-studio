import type { Node, Edge } from 'reactflow'
import type { NodeType, WorkflowDefinition, WorkflowNode } from '@/lib/types'

/** Data stored on every React Flow node. */
export type AgentNodeData = {
  label: string
  config: Record<string, unknown>
}

export type AgentNode = Node<AgentNodeData>
export type AgentEdge = Edge

/**
 * The node-type semantic palette. These six hues encode node meaning on the
 * canvas and are the single source of truth — the sidebar, config panel,
 * how-it-works page, and run-page minimap all derive from here so they can
 * never drift. (Distinct from the chrome `accent`, which drives buttons/links.)
 */
export const NODE_COLORS: Record<NodeType, string> = {
  input: '#3b82f6',
  llm_call: '#a855f7',
  tool_call: '#f97316',
  condition: '#eab308',
  human_pause: '#ef4444',
  output: '#22c55e',
}

/** Tailwind text-colour classes matching NODE_COLORS (kept in lock-step). */
export const NODE_TEXT_CLS: Record<NodeType, string> = {
  input: 'text-blue-400',
  llm_call: 'text-purple-400',
  tool_call: 'text-orange-400',
  condition: 'text-yellow-400',
  human_pause: 'text-red-400',
  output: 'text-green-400',
}

export const NODE_LABELS: Record<NodeType, string> = {
  input: 'Input',
  llm_call: 'LLM Call',
  tool_call: 'Tool Call',
  condition: 'Condition',
  human_pause: 'Human Pause',
  output: 'Output',
}

export const NODE_TYPES_LIST: NodeType[] = [
  'input',
  'llm_call',
  'tool_call',
  'condition',
  'human_pause',
  'output',
]

export const DEFAULT_CONFIGS: Record<NodeType, Record<string, unknown>> = {
  input: { placeholder: '' },
  llm_call: { prompt: '', system: '', tools: [] },
  tool_call: { toolName: 'web_search', args: {} },
  condition: { expression: '' },
  human_pause: { message: '' },
  output: { template: '' },
}

/** Serialize React Flow state → WorkflowDefinition for the API. */
export function serializeWorkflow(
  name: string,
  nodes: AgentNode[],
  edges: AgentEdge[]
): WorkflowDefinition {
  return {
    name,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (n.type ?? 'input') as NodeType,
      label: n.data.label,
      position: n.position,
      config: n.data.config,
    }) as unknown as WorkflowNode),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: (e.sourceHandle ?? null) as 'true' | 'false' | null,
    })),
  }
}

/** Reverse of serializeWorkflow — converts a WorkflowDefinition into React Flow state. */
export function deserializeWorkflow(definition: WorkflowDefinition): {
  nodes: AgentNode[]
  edges: AgentEdge[]
} {
  const nodes: AgentNode[] = definition.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 0, y: 0 },
    data: {
      label: n.label,
      config: n.config as Record<string, unknown>,
    },
  }))
  const edges: AgentEdge[] = definition.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    ...(e.sourceHandle != null ? { sourceHandle: e.sourceHandle } : {}),
  }))
  return { nodes, edges }
}
