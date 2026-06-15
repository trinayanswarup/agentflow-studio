import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before all imports — values are available inside vi.mock factories.
const { mockCallLLM } = vi.hoisted(() => ({ mockCallLLM: vi.fn() }))

vi.mock('@/lib/llm/groq', () => ({
  callLLM: mockCallLLM,
  groqChat: vi.fn(),
  GROQ_MODEL: 'llama-3.3-70b-versatile',
}))

import { WorkflowRunner } from '@/lib/engine/runner'
import type { TraceEvent, WorkflowDefinition } from '@/lib/types'

const DEFAULT_LLM = {
  text: 'mocked response',
  tokensUsed: 10,
  toolCalls: [] as [],
  provider: 'groq' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCallLLM.mockResolvedValue(DEFAULT_LLM)
})

/** Attach a trace listener and return the accumulated events array. */
function collectTrace(runner: WorkflowRunner): TraceEvent[] {
  const events: TraceEvent[] = []
  runner.on('trace', (e: TraceEvent) => events.push(e))
  return events
}

// ── Shared workflow definitions ────────────────────────────────────────────────

const linearDef: WorkflowDefinition = {
  name: 'Linear',
  nodes: [
    { id: 'input_1', type: 'input', label: 'Input', config: {} },
    { id: 'llm_1', type: 'llm_call', label: 'LLM', config: { prompt: '{{input_output}}', tools: [] } },
    { id: 'out_1', type: 'output', label: 'Output', config: {} },
  ],
  edges: [
    { id: 'e1', source: 'input_1', target: 'llm_1' },
    { id: 'e2', source: 'llm_1', target: 'out_1' },
  ],
}

const conditionDef: WorkflowDefinition = {
  name: 'Condition',
  nodes: [
    { id: 'input_1', type: 'input', label: 'Input', config: {} },
    {
      id: 'cond_1',
      type: 'condition',
      label: 'Branch',
      config: { expression: '{{input_output}} contains hello' },
    },
    { id: 'out_a', type: 'output', label: 'Output A', config: { template: 'branch-true' } },
    { id: 'out_b', type: 'output', label: 'Output B', config: { template: 'branch-false' } },
  ],
  edges: [
    { id: 'e1', source: 'input_1', target: 'cond_1' },
    { id: 'e2', source: 'cond_1', target: 'out_a', sourceHandle: 'true' },
    { id: 'e3', source: 'cond_1', target: 'out_b', sourceHandle: 'false' },
  ],
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WorkflowRunner', () => {
  it('linear workflow executes nodes in order and emits correct trace events', async () => {
    const runner = new WorkflowRunner(linearDef)
    const events = collectTrace(runner)
    const result = await runner.run('test input')

    expect(result.status).toBe('completed')
    expect(result.output).toBe('mocked response')

    const types = events.map((e) => e.type)
    expect(types[0]).toBe('run_start')
    expect(types[types.length - 1]).toBe('run_complete')

    const stepStarts = events.filter((e) => e.type === 'step_start')
    const stepDones = events.filter((e) => e.type === 'step_done')
    expect(stepStarts).toHaveLength(3)
    expect(stepDones).toHaveLength(3)

    const complete = events.find((e) => e.type === 'run_complete')
    expect(complete?.type === 'run_complete' && complete.output).toBe('mocked response')
  })

  it('condition node takes true branch when expression matches', async () => {
    const runner = new WorkflowRunner(conditionDef)
    const events = collectTrace(runner)
    const result = await runner.run('hello world')

    expect(result.output).toBe('branch-true')
    const visitedIds = events
      .filter((e) => e.type === 'step_done')
      .map((e) => e.type === 'step_done' && e.nodeId)
    expect(visitedIds).toContain('out_a')
    expect(visitedIds).not.toContain('out_b')
  })

  it('condition node takes false branch when expression does not match', async () => {
    const runner = new WorkflowRunner(conditionDef)
    const events = collectTrace(runner)
    const result = await runner.run('goodbye world')

    expect(result.output).toBe('branch-false')
    const visitedIds = events
      .filter((e) => e.type === 'step_done')
      .map((e) => e.type === 'step_done' && e.nodeId)
    expect(visitedIds).toContain('out_b')
    expect(visitedIds).not.toContain('out_a')
  })

  it('loop guard emits loop_limit and exits after max iterations', async () => {
    // cond_1 always takes true → loops back to llm_1 until the guard fires.
    const loopDef: WorkflowDefinition = {
      name: 'Loop',
      nodes: [
        { id: 'input_1', type: 'input', label: 'Input', config: {} },
        { id: 'llm_1', type: 'llm_call', label: 'LLM', config: { prompt: '{{input_output}}', tools: [] } },
        { id: 'cond_1', type: 'condition', label: 'Loop Gate', config: { expression: '{{input_output}}' } },
        { id: 'out_1', type: 'output', label: 'Output', config: {} },
      ],
      edges: [
        { id: 'e1', source: 'input_1', target: 'llm_1' },
        { id: 'e2', source: 'llm_1', target: 'cond_1' },
        { id: 'e3', source: 'cond_1', target: 'llm_1', sourceHandle: 'true' },
        { id: 'e4', source: 'cond_1', target: 'out_1', sourceHandle: 'false' },
      ],
    }

    const runner = new WorkflowRunner(loopDef)
    const events = collectTrace(runner)
    const result = await runner.run('hello world')

    const loopLimit = events.find((e) => e.type === 'loop_limit')
    expect(loopLimit).toBeDefined()

    expect(result.status).toBe('completed')
    const complete = events.find((e) => e.type === 'run_complete')
    expect(complete).toBeDefined()
  })

  it('unknown node type emits step_error instead of crashing', async () => {
    const badDef = {
      name: 'Bad',
      nodes: [
        { id: 'input_1', type: 'input', label: 'Input', config: {} },
        { id: 'bad_1', type: 'nonexistent_type', label: 'Bad Node', config: {} },
      ],
      edges: [{ id: 'e1', source: 'input_1', target: 'bad_1' }],
    } as unknown as WorkflowDefinition

    const runner = new WorkflowRunner(badDef)
    const events = collectTrace(runner)

    await expect(runner.run('test')).resolves.toMatchObject({ status: 'failed' })

    const stepError = events.find((e) => e.type === 'step_error')
    expect(stepError).toBeDefined()
    expect(stepError?.type === 'step_error' && stepError.nodeId).toBe('bad_1')
  })

  it('slug and UUID references both resolve in the same run', async () => {
    const def: WorkflowDefinition = {
      name: 'Slug vs UUID',
      nodes: [
        { id: 'input-node', type: 'input', label: 'Start', config: {} },
        {
          id: 'llm-node',
          type: 'llm_call',
          label: 'Respond',
          config: { prompt: '{{start_output}}', tools: [] },
        },
        {
          id: 'out-node',
          type: 'output',
          label: 'Finish',
          // slug form: {{respond_output}}  |  UUID form: {{llm-node_output}}
          config: { template: 'slug={{respond_output}} uuid={{llm-node_output}}' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-node', target: 'llm-node' },
        { id: 'e2', source: 'llm-node', target: 'out-node' },
      ],
    }

    const runner = new WorkflowRunner(def)
    const result = await runner.run('any input')

    expect(result.status).toBe('completed')
    expect(result.output).toBe('slug=mocked response uuid=mocked response')
  })

  it('workflow with no input node fails with a descriptive error', async () => {
    const noInputDef: WorkflowDefinition = {
      name: 'No Input',
      nodes: [
        { id: 'llm_1', type: 'llm_call', label: 'LLM', config: { prompt: 'hello', tools: [] } },
        { id: 'out_1', type: 'output', label: 'Output', config: {} },
      ],
      edges: [{ id: 'e1', source: 'llm_1', target: 'out_1' }],
    }

    const runner = new WorkflowRunner(noInputDef)
    const events = collectTrace(runner)
    const result = await runner.run('test')

    expect(result.status).toBe('failed')
    const runError = events.find((e) => e.type === 'run_error')
    expect(runError).toBeDefined()
    expect(runError?.type === 'run_error' && runError.error.toLowerCase()).toContain('input')
  })
})
