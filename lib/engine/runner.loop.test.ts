/**
 * Loop-guard tests for the runner. These use only deterministic node types
 * (input, human_pause as a passthrough, condition, output) so no API keys are
 * needed: human_pause auto-approves when there is no runId in context.
 */
import { it, expect } from 'vitest'
import { WorkflowRunner } from './runner'
import type { TraceEvent, WorkflowDefinition } from '@/lib/types'

// A workflow whose condition is always true and loops back upstream forever —
// the runner's per-node guard must cap it.
//
//   input_1 → step_1 → gate_1
//   gate_1 (true)  → step_1   (loop)
//   gate_1 (false) → output_1 (forward / exit)
const loopingWorkflow: WorkflowDefinition = {
  name: 'Always-Loop',
  nodes: [
    { id: 'input_1', type: 'input', label: 'Input', config: {} },
    { id: 'step_1', type: 'human_pause', label: 'Step', config: { message: 'pass through' } },
    { id: 'gate_1', type: 'condition', label: 'Loop?', config: { expression: 'true' } },
    { id: 'output_1', type: 'output', label: 'Out', config: { template: '' } },
  ],
  edges: [
    { id: 'e1', source: 'input_1', target: 'step_1' },
    { id: 'e2', source: 'step_1', target: 'gate_1' },
    { id: 'e3', source: 'gate_1', target: 'step_1', sourceHandle: 'true' },
    { id: 'e4', source: 'gate_1', target: 'output_1', sourceHandle: 'false' },
  ],
}

it('caps a runaway loop at the max iterations and emits loop_limit', async () => {
  const runner = new WorkflowRunner(loopingWorkflow)
  const result = await runner.run('hello')

  expect(result.status).toBe('completed')

  // step_1 must run exactly 3 times (the per-node guard), no more.
  const stepRuns = result.trace.filter(
    (e: TraceEvent) => e.type === 'step_done' && e.nodeId === 'step_1'
  )
  expect(stepRuns).toHaveLength(3)

  // A loop_limit event must have been emitted for the node we refused to re-enter.
  const loopLimit = result.trace.find((e: TraceEvent) => e.type === 'loop_limit')
  expect(loopLimit).toBeDefined()
  if (loopLimit && loopLimit.type === 'loop_limit') {
    expect(loopLimit.nodeId).toBe('step_1')
    expect(loopLimit.iterations).toBe(3)
  }

  // The run must have escaped via the forward branch to the output node.
  const reachedOutput = result.trace.some(
    (e: TraceEvent) => e.type === 'step_done' && e.nodeId === 'output_1'
  )
  expect(reachedOutput).toBe(true)
})

it('a non-looping condition workflow runs straight through without loop_limit', async () => {
  // gate is false → goes straight to output, step_1 runs once.
  const linear: WorkflowDefinition = {
    name: 'Linear',
    nodes: [
      { id: 'input_1', type: 'input', label: 'Input', config: {} },
      { id: 'step_1', type: 'human_pause', label: 'Step', config: {} },
      { id: 'gate_1', type: 'condition', label: 'Loop?', config: { expression: 'false' } },
      { id: 'output_1', type: 'output', label: 'Out', config: { template: '' } },
    ],
    edges: [
      { id: 'e1', source: 'input_1', target: 'step_1' },
      { id: 'e2', source: 'step_1', target: 'gate_1' },
      { id: 'e3', source: 'gate_1', target: 'step_1', sourceHandle: 'true' },
      { id: 'e4', source: 'gate_1', target: 'output_1', sourceHandle: 'false' },
    ],
  }

  const result = await new WorkflowRunner(linear).run('hi')
  expect(result.status).toBe('completed')
  expect(result.trace.some((e: TraceEvent) => e.type === 'loop_limit')).toBe(false)
  const stepRuns = result.trace.filter(
    (e: TraceEvent) => e.type === 'step_done' && e.nodeId === 'step_1'
  )
  expect(stepRuns).toHaveLength(1)
})
