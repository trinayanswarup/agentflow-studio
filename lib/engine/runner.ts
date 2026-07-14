import { EventEmitter } from 'node:events'
import type {
  ExecutionContext,
  NodeExecutionResult,
  TraceEvent,
  WorkflowDefinition,
  WorkflowNode,
} from '@/lib/types'
import { createContext, resolveTemplate, setNodeOutput } from '@/lib/engine/context'
import { buildSlugMap } from '@/lib/engine/slugs'
import { executeLlmCall } from '@/lib/engine/nodes/llm-call'
import { executeToolCall } from '@/lib/engine/nodes/tool-call'
import { executeCondition } from '@/lib/engine/nodes/condition'
import { executeHumanPause } from '@/lib/engine/nodes/human-pause'
import { executeOutput } from '@/lib/engine/nodes/output'
import { startRunTrace, type TraceSource, type RunTrace } from '@/lib/observability/langfuse'
import { runWithGuardrailContext } from '@/lib/engine/guardrail-events'
import { CostTracker, runWithCostTracker } from '@/lib/engine/cost-tracker'
import { withTimeout, getStepTimeoutMs, StepTimeoutError } from '@/lib/engine/with-timeout'
import { OutputValidationError } from '@/lib/llm/structured-output'

// Side-effect imports: each tool file registers itself with the registry.
import '@/lib/tools/web-fetch'
import '@/lib/tools/web-search'
import '@/lib/tools/extract-json'
import '@/lib/tools/send-webhook'
import '@/lib/tools/evaluate-output'

/** Hard cap on steps per run — guards against cycles in the graph. */
const MAX_STEPS = 100

/**
 * How many times a single node may be entered before the runner refuses to
 * loop back to it. A `condition` whose branch points upstream is how a loop is
 * expressed; this guard caps the retries.
 */
const MAX_ITERATIONS_PER_NODE = 3

export interface WorkflowRunnerOptions {
  /** Included in the Langfuse trace's metadata, if observability is configured. */
  workflowId?: string
  /** Where the run was triggered from — included in the Langfuse trace's metadata. */
  source?: TraceSource
}

export interface RunResult {
  status: 'completed' | 'failed'
  output: string
  trace: TraceEvent[]
  totalTokens: number
  totalLatencyMs: number
  /** Node ID of the step that caused the run to fail, if any. */
  failedStep?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Machine-readable code for guardrail failures, if the error carries one. */
function errorCode(error: unknown): string | undefined {
  if (error instanceof OutputValidationError) return error.code
  if (error instanceof StepTimeoutError) return error.code
  return undefined
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
    default: {
      const type = (node as unknown as { type: string }).type
      throw new Error(`Unknown node type: "${type}"`)
    }
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
    private readonly runId?: string,
    private readonly options: WorkflowRunnerOptions = {}
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

  /** Resolve a condition's branch target without throwing if the edge is absent. */
  private findBranchTarget(node: WorkflowNode, branch: 'true' | 'false'): WorkflowNode | null {
    const edge = this.definition.edges.find(
      (e) => e.source === node.id && e.sourceHandle === branch
    )
    if (!edge) return null
    return this.definition.nodes.find((n) => n.id === edge.target) ?? null
  }

  async run(input: string): Promise<RunResult> {
    const tracer = startRunTrace({
      workflowName: this.definition.name,
      workflowId: this.options.workflowId,
      runId: this.runId,
      source: this.options.source ?? 'cli',
      input,
    })
    const costTracker = new CostTracker()

    return runWithCostTracker(costTracker, () => this.runInternal(input, tracer, costTracker))
  }

  private async runInternal(
    input: string,
    tracer: RunTrace,
    costTracker: CostTracker
  ): Promise<RunResult> {
    const context = createContext(input, this.runId)
    // Build slug aliases upfront so every node output is reachable via both
    // its UUID key ({{nodeId_output}}) and a readable alias ({{slug_output}}).
    const slugMap = buildSlugMap(this.definition.nodes)
    const trace: TraceEvent[] = []
    const runStarted = Date.now()
    const stepTimeoutMs = getStepTimeoutMs()
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
      tracer.finish({ output: '', status: 'failed', error: errorMessage(error) })
      return { status: 'failed', output: '', trace, totalTokens, totalLatencyMs: Date.now() - runStarted }
    }

    let previousOutput = input
    let finalOutput = input
    let steps = 0
    // How many times each node has been entered — drives the loop guard.
    const visitCounts = new Map<string, number>()

    while (current) {
      if (++steps > MAX_STEPS) {
        const error = `Run exceeded ${MAX_STEPS} steps — the workflow graph likely has a cycle`
        this.emitTrace({ type: 'run_error', error, timestamp: now() }, trace)
        tracer.finish({ output: '', status: 'failed', error })
        return { status: 'failed', output: '', trace, totalTokens, totalLatencyMs: Date.now() - runStarted }
      }

      const node: WorkflowNode = current
      visitCounts.set(node.id, (visitCounts.get(node.id) ?? 0) + 1)

      this.emitTrace(
        { type: 'step_start', nodeId: node.id, label: node.label, nodeType: node.type, timestamp: now() },
        trace
      )

      if (node.type === 'human_pause') {
        const message = node.config.message
          ? resolveTemplate(node.config.message, context)
          : 'Paused for human review'
        this.emitTrace(
          { type: 'human_pause', nodeId: node.id, label: node.label, message, previousOutput, timestamp: now() },
          trace
        )
      }

      const runNode = (): Promise<NodeExecutionResult> =>
        runWithGuardrailContext(
          { nodeId: node.id, label: node.label, emit: (event) => this.emitTrace(event, trace) },
          () =>
            tracer.runNodeSpan(
              { nodeId: node.id, nodeType: node.type, label: node.label },
              () => executeNode(node, context, previousOutput)
            )
        )

      const stepStarted = Date.now()
      let result: NodeExecutionResult
      try {
        // human_pause can legitimately wait up to 5 minutes for a reviewer —
        // it has its own long internal timeout, so the step-timeout guard
        // (meant to catch hung LLM/tool calls) doesn't apply to it.
        result = node.type === 'human_pause' ? await runNode() : await withTimeout(runNode, stepTimeoutMs)
      } catch (error) {
        const message = errorMessage(error)
        const code = errorCode(error)

        if (error instanceof StepTimeoutError) {
          this.emitTrace(
            { type: 'step_timeout', nodeId: node.id, label: node.label, timeoutMs: error.timeoutMs, timestamp: now() },
            trace
          )
          tracer.recordEvent('step_timeout', { nodeId: node.id, label: node.label, timeoutMs: error.timeoutMs })
        } else {
          this.emitTrace(
            {
              type: 'step_error',
              nodeId: node.id,
              label: node.label,
              nodeType: node.type,
              error: message,
              code,
              latencyMs: Date.now() - stepStarted,
              timestamp: now(),
            },
            trace
          )
        }

        this.emitTrace({ type: 'run_error', error: message, code, timestamp: now() }, trace)
        tracer.finish({ output: '', status: 'failed', error: message })
        return { status: 'failed', output: '', trace, totalTokens, totalLatencyMs: Date.now() - runStarted, failedStep: node.id }
      }

      setNodeOutput(context, node.id, result.output)
      // Also register under the readable slug so {{slug_output}} templates work.
      const slug = slugMap.get(node.id)
      if (slug) context[`${slug}_output`] = result.output
      totalTokens += result.tokensUsed

      this.emitTrace(
        {
          type: 'step_done',
          nodeId: node.id,
          label: node.label,
          nodeType: node.type,
          output: result.output,
          latencyMs: Date.now() - stepStarted,
          tokens: result.tokensUsed,
          timestamp: now(),
        },
        trace
      )

      previousOutput = result.output

      // Cost cap: checked after each step, since actual token usage is only
      // known once the call returns — abort before scheduling further work.
      if (costTracker.isOverCap()) {
        this.emitTrace(
          {
            type: 'budget_exceeded',
            nodeId: node.id,
            label: node.label,
            totalCostUsd: costTracker.totalCostUsd,
            capUsd: costTracker.capUsd,
            timestamp: now(),
          },
          trace
        )
        tracer.recordEvent('budget_exceeded', {
          totalCostUsd: costTracker.totalCostUsd,
          capUsd: costTracker.capUsd,
        })
        const message = `Run aborted: estimated cost $${costTracker.totalCostUsd.toFixed(4)} exceeded cap $${costTracker.capUsd}`
        this.emitTrace({ type: 'run_error', error: message, code: 'BUDGET_EXCEEDED', timestamp: now() }, trace)
        tracer.finish({ output: '', status: 'failed', error: message })
        return { status: 'failed', output: '', trace, totalTokens, totalLatencyMs: Date.now() - runStarted, failedStep: node.id }
      }

      if (node.type === 'output') {
        finalOutput = result.output
        break
      }

      let next: WorkflowNode | null
      try {
        next = this.findNextNode(node, result.branch)
      } catch (error) {
        this.emitTrace({ type: 'run_error', error: errorMessage(error), timestamp: now() }, trace)
        tracer.finish({ output: '', status: 'failed', error: errorMessage(error) })
        return { status: 'failed', output: '', trace, totalTokens, totalLatencyMs: Date.now() - runStarted }
      }

      // Loop guard: if the next node has already been entered the maximum number
      // of times, refuse to re-enter it. For a condition (the only way a loop is
      // expressed), take the other/forward branch instead; otherwise end the run.
      if (next && (visitCounts.get(next.id) ?? 0) >= MAX_ITERATIONS_PER_NODE) {
        this.emitTrace(
          {
            type: 'loop_limit',
            nodeId: next.id,
            label: next.label,
            nodeType: next.type,
            iterations: visitCounts.get(next.id) ?? 0,
            timestamp: now(),
          },
          trace
        )
        next =
          node.type === 'condition'
            ? this.findBranchTarget(node, result.branch === 'true' ? 'false' : 'true')
            : null
      }

      current = next
      if (!current) finalOutput = previousOutput
    }

    const totalLatencyMs = Date.now() - runStarted
    this.emitTrace(
      { type: 'run_complete', output: finalOutput, totalLatencyMs, totalTokens, timestamp: now() },
      trace
    )
    tracer.finish({ output: finalOutput, status: 'completed' })
    return { status: 'completed', output: finalOutput, trace, totalTokens, totalLatencyMs }
  }
}
