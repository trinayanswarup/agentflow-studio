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
    /**
     * Template for the content shown in the reviewable textarea. Defaults to
     * the previous node's raw output when omitted — but that default is
     * wrong whenever a human_pause sits directly after a `condition` node
     * (its output is just "true"/"false"), so any workflow branching through
     * a condition before a review step should set this explicitly, e.g.
     * `{{score_1_output}}` to show the upstream score/reasoning instead of
     * the condition's boolean.
     */
    content?: string
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
      /** Machine-readable error code, e.g. OUTPUT_VALIDATION_FAILED, STEP_TIMEOUT. */
      code?: string
      latencyMs: number
      timestamp: string
    }
  | { type: 'human_pause'; nodeId: string; label: string; message: string; previousOutput: string; timestamp: string }
  | {
      type: 'loop_limit'
      /** The node the runner refused to re-enter (the loop target). */
      nodeId: string
      label: string
      nodeType: NodeType
      /** How many times the node had already been entered when the loop was cut. */
      iterations: number
      timestamp: string
    }
  | {
      /** A structured LLM response failed schema validation and is being retried once with a correction prompt. */
      type: 'validation_retry'
      nodeId: string
      label: string
      error: string
      /** Preview of the model output that failed validation — for failure diagnosis. */
      outputPreview: string
      timestamp: string
    }
  | {
      /** A transient (429/5xx/network/timeout) call is being retried with exponential backoff. */
      type: 'backoff_retry'
      nodeId: string
      label: string
      attempt: number
      delayMs: number
      error: string
      /** HTTP status that triggered the retry, if the error carried one (null for network/timeout errors). */
      httpStatus: number | null
      timestamp: string
    }
  | {
      /** The run's estimated cost passed WORKFLOW_COST_CAP_USD — the run is being aborted. */
      type: 'budget_exceeded'
      nodeId: string
      label: string
      totalCostUsd: number
      capUsd: number
      timestamp: string
    }
  | {
      /** A node's execution exceeded WORKFLOW_STEP_TIMEOUT_MS. */
      type: 'step_timeout'
      nodeId: string
      label: string
      timeoutMs: number
      timestamp: string
    }
  | {
      type: 'run_complete'
      output: string
      totalLatencyMs: number
      totalTokens: number
      timestamp: string
    }
  | {
      type: 'run_error'
      error: string
      /** Machine-readable error code, e.g. OUTPUT_VALIDATION_FAILED, BUDGET_EXCEEDED, STEP_TIMEOUT. */
      code?: string
      timestamp: string
    }

/** What a node executor returns to the runner. */
export interface NodeExecutionResult {
  output: string
  tokensUsed: number
  /** Only set by condition nodes — which outgoing handle to follow. */
  branch?: 'true' | 'false'
}
