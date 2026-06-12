// Shared types for AgentFlow Studio.
// The execution engine, API routes, and UI all import from this file.

export type NodeType =
  | 'input'
  | 'llm_call'
  | 'tool_call'
  | 'condition'
  | 'human_pause'
  | 'output'

interface BaseNode {
  id: string
  label: string
  /** Canvas position — unused by the engine, persisted for React Flow. */
  position?: { x: number; y: number }
}

export interface InputNode extends BaseNode {
  type: 'input'
  config: {
    /** Hint shown in the run UI input form. */
    placeholder?: string
  }
}

export interface LlmCallNode extends BaseNode {
  type: 'llm_call'
  config: {
    /** Prompt template — supports {{nodeId_output}} placeholders. */
    prompt: string
    /** Optional system prompt template. */
    system?: string
    /** Names of registered tools the LLM may call (agent loop). */
    tools?: string[]
  }
}

export interface ToolCallNode extends BaseNode {
  type: 'tool_call'
  config: {
    /** Name of a registered tool. */
    toolName: string
    /** Tool arguments — values are template strings, resolved then Zod-validated. */
    args: Record<string, string>
  }
}

export interface ConditionNode extends BaseNode {
  type: 'condition'
  config: {
    /**
     * Expression like `{{search_output}} contains http` or `{{score_output}} >= 7`.
     * Operators: contains, not_contains, ==, !=, >=, <=, >, <.
     * Without an operator, the resolved value is checked for truthiness.
     */
    expression: string
  }
}

export interface HumanPauseNode extends BaseNode {
  type: 'human_pause'
  config: {
    /** Message template shown to the reviewer. */
    message?: string
  }
}

export interface OutputNode extends BaseNode {
  type: 'output'
  config: {
    /** Template for the final output. Defaults to the previous node's output. */
    template?: string
  }
}

export type WorkflowNode =
  | InputNode
  | LlmCallNode
  | ToolCallNode
  | ConditionNode
  | HumanPauseNode
  | OutputNode

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  /** Set on edges leaving a condition node: which branch this edge belongs to. */
  sourceHandle?: 'true' | 'false' | null
}

export interface WorkflowDefinition {
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

/**
 * Shared execution context. Keys are `${nodeId}_output` plus the reserved
 * key `input` (the run input). Templates resolve against this object.
 */
export type ExecutionContext = Record<string, unknown>

/** One tool invocation made inside an LLM agent loop. */
export interface ToolCallRecord {
  name: string
  arguments: Record<string, unknown>
  result: string
  latencyMs: number
}

export interface LLMResult {
  text: string
  tokensUsed: number
  toolCalls: ToolCallRecord[]
  provider: 'groq' | 'gemini'
}

export type StepStatus = 'running' | 'done' | 'error' | 'waiting'

export type TraceEvent =
  | { type: 'run_start'; workflowName: string; input: string; timestamp: string }
  | { type: 'step_start'; nodeId: string; label: string; nodeType: NodeType; timestamp: string }
  | {
      type: 'step_done'
      nodeId: string
      label: string
      nodeType: NodeType
      output: string
      latencyMs: number
      tokens: number
      timestamp: string
    }
  | {
      type: 'step_error'
      nodeId: string
      label: string
      nodeType: NodeType
      error: string
      latencyMs: number
      timestamp: string
    }
  | { type: 'human_pause'; nodeId: string; label: string; message: string; timestamp: string }
  | {
      type: 'run_complete'
      output: string
      totalLatencyMs: number
      totalTokens: number
      timestamp: string
    }
  | { type: 'run_error'; error: string; timestamp: string }

/** What a node executor returns to the runner. */
export interface NodeExecutionResult {
  output: string
  tokensUsed: number
  /** Only set by condition nodes — which outgoing handle to follow. */
  branch?: 'true' | 'false'
}
