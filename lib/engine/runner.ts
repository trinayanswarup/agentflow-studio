import { EventEmitter } from 'node:events'
import type {
  ExecutionContext,
  NodeExecutionResult,
  TraceEvent,
  WorkflowDefinition,
  WorkflowNode,
} from '@/lib/types'
import { createContext, resolveTemplate, setNodeOutput } from '@/lib/engine/context'
import { executeLlmCall } from '@/lib/engine/nodes/llm-call'
import { executeToolCall } from '@/lib/engine/nodes/tool-call'
import { executeCondition } from '@/lib/engine/nodes/condition'
import { executeHumanPause } from '@/lib/engine/nodes/human-pause'
import { executeOutput } from '@/lib/engine/nodes/output'

// Side-effect imports: each tool file registers itself with the registry.
import '@/lib/tools/web-fetch'
import '@/lib/tools/web-search'
import '@/lib/tools/extract-json'
import '@/lib/tools/send-webhook'
import '@/lib/tools/evaluate-output'

/** Hard cap on steps per run — guards against cycles in the graph. */
const MAX_STEPS = 100

export interface RunResult {
  status: 'completed' | 'failed'
  output: string
  trace: TraceEvent[]
  totalTokens: number
  totalLatencyMs: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function now(): string {
  return new Date().toISOString()
}

async function executeNode(
  node: WorkflowNode,
  context: ExecutionContext,
  previousOutput: string
): Promise<NodeExecutionResult> {
  switch (node.type) {
    case 'input':
      return { output: typeof context.input === 'string' ? context.input : '', tokensUsed: 0 }
    case 'llm_call':
      return executeLlmCall(node, context)
    case 'tool_call':
      return executeToolCall(node, context)
    case 'condition':
      return executeCondition(node, context)
    case 'human_pause':
      return executeHumanPause(node, context, previousOutput)
    case 'output':
      return executeOutput(node, context, previousOutput)
  }
}

/**
 * Walks a workflow graph node by node, executing each and emitting
 * 'trace' events (TraceEvent payloads) along the way.
 *
 *   const runner = new WorkflowRunner(definition)
 *   runner.on('trace', (event) => ...)
 *   const result = await runner.run('Nord Security')
 */
export class WorkflowRunner extends EventEmitter {
  constructor(
    private readonly definition: WorkflowDefinition,
    private readonly runId?: string
  ) {
    super()
  }

  private emitTrace(event: TraceEvent, trace: TraceEvent[]): void {
    trace.push(event)
    this.emit('trace', event)
  }

  /** The entry node: the single `input` node of the workflow. */
  private findStartNode(): WorkflowNode {
    const inputNodes = this.definition.nodes.filter((n) => n.type === 'input')
    if (inputNodes.length !== 1) {
      throw new Error(`Workflow must have exactly one input node, found ${inputNodes.length}`)
    }
    return inputNodes[0]
  }

  private findNextNode(current: WorkflowNode, branch?: 'true' | 'false'): WorkflowNode | null {
    const outgoing = this.definition.edges.filter((e) => e.source === current.id)
    if (outgoing.length === 0) return null

    const edge =
      current.type === 'condition'
        ? outgoing.find((e) => e.sourceHandle === branch)
        : outgoing[0]
    if (!edge) {
      if (current.type === 'condition') {
        throw new Error(`Condition node "${current.id}" has no edge for branch "${branch}"`)
      }
      return null
    }

    const next = this.definition.nodes.find((n) => n.id === edge.target)
    if (!next) throw new Error(`Edge "${edge.id}" points to unknown node "${edge.target}"`)
    return next
  }

  async run(input: string): Promise<RunResult> {
    const context = createContext(input, this.runId)
    const trace: TraceEvent[] = []
    const runStarted = Date.now()
    let totalTokens = 0

    this.emitTrace(
      { type: 'run_start', workflowName: this.definition.name, input, timestamp: now() },
      trace
    )

    let current: WorkflowNode | null
    try {
      current = this.findStartNode()
    } catch (error) {
      this.emitTrace({ type: 'run_error', error: errorMessage(error), timestamp: now() }, trace)
      return { status: 'failed', output: '', trace, totalTokens, totalLatencyMs: Date.now() - runStarted }
    }

    let previousOutput = input
    let finalOutput = input
    let steps = 0

    while (current) {
      if (++steps > MAX_STEPS) {
        const error = `Run exceeded ${MAX_STEPS} steps — the workflow graph likely has a cycle`
        this.emitTrace({ type: 'run_error', error, timestamp: now() }, trace)
        return { status: 'failed', output: '', trace, totalTokens, totalLatencyMs: Date.now() - runStarted }
      }

      this.emitTrace(
        { type: 'step_start', nodeId: current.id, label: current.label, nodeType: current.type, timestamp: now() },
        trace
      )

      if (current.type === 'human_pause') {
        const message = current.config.message
          ? resolveTemplate(current.config.message, context)
          : 'Paused for human review'
        this.emitTrace(
          { type: 'human_pause', nodeId: current.id, label: current.label, message, previousOutput, timestamp: now() },
          trace
        )
      }

      const stepStarted = Date.now()
      let result: NodeExecutionResult
      try {
        result = await executeNode(current, context, previousOutput)
      } catch (error) {
        const message = errorMessage(error)
        this.emitTrace(
          {
            type: 'step_error',
            nodeId: current.id,
            label: current.label,
            nodeType: current.type,
            error: message,
            latencyMs: Date.now() - stepStarted,
            timestamp: now(),
          },
          trace
        )
        this.emitTrace({ type: 'run_error', error: message, timestamp: now() }, trace)
        return { status: 'failed', output: '', trace, totalTokens, totalLatencyMs: Date.now() - runStarted }
      }

      setNodeOutput(context, current.id, result.output)
      totalTokens += result.tokensUsed

      this.emitTrace(
        {
          type: 'step_done',
          nodeId: current.id,
          label: current.label,
          nodeType: current.type,
          output: result.output,
          latencyMs: Date.now() - stepStarted,
          tokens: result.tokensUsed,
          timestamp: now(),
        },
        trace
      )

      previousOutput = result.output
      if (current.type === 'output') {
        finalOutput = result.output
        break
      }

      try {
        current = this.findNextNode(current, result.branch)
      } catch (error) {
        this.emitTrace({ type: 'run_error', error: errorMessage(error), timestamp: now() }, trace)
        return { status: 'failed', output: '', trace, totalTokens, totalLatencyMs: Date.now() - runStarted }
      }
      if (!current) finalOutput = previousOutput
    }

    const totalLatencyMs = Date.now() - runStarted
    this.emitTrace(
      { type: 'run_complete', output: finalOutput, totalLatencyMs, totalTokens, timestamp: now() },
      trace
    )
    return { status: 'completed', output: finalOutput, trace, totalTokens, totalLatencyMs }
  }
}
