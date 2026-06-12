import type { Node, Edge } from 'reactflow'
import type { NodeType, WorkflowDefinition, WorkflowNode } from '@/lib/types'

/** Data stored on every React Flow node. */
export type AgentNodeData = {
  label: string
  config: Record<string, unknown>
}

export type AgentNode = Node<AgentNodeData>
export type AgentEdge = Edge

/** Border colors keyed by node type — used in components and the sidebar. */
export const NODE_COLORS: Record<NodeType, string> = {
  input: '#3b82f6',
  llm_call: '#a855f7',
  tool_call: '#f97316',
  condition: '#eab308',
  human_pause: '#ef4444',
  output: '#22c55e',
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
