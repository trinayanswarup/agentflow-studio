import { z } from 'zod'
import type { RunResult } from '@/lib/engine/runner'
import type { TraceEvent } from '@/lib/types'
import { judgeScoreSchema } from '@/lib/schemas/judge-score'
import { getPricing } from '@/lib/engine/pricing-config'
import { GROQ_MODEL } from '@/lib/llm/groq'
import type { Assertion } from './types'

type StepDoneEvent = Extract<TraceEvent, { type: 'step_done' }>
type RunErrorEvent = Extract<TraceEvent, { type: 'run_error' }>

function stepDonesFor(result: RunResult, nodeId: string): StepDoneEvent[] {
  return result.trace.filter((e): e is StepDoneEvent => e.type === 'step_done' && e.nodeId === nodeId)
}

/** The given node's last completed output, or the run's final output if no nodeId is given. */
function outputFor(result: RunResult, nodeId?: string): string {
  if (!nodeId) return result.output
  const steps = stepDonesFor(result, nodeId)
  return steps.length > 0 ? steps[steps.length - 1].output : ''
}

function hasNodeId(event: TraceEvent): event is TraceEvent & { nodeId: string } {
  return 'nodeId' in event
}

/** Estimated USD cost for the run, using the same blended-rate approximation as CostTracker. */
function estimateCostUsd(totalTokens: number): number {
  const pricing = getPricing(GROQ_MODEL)
  const blendedPer1M = (pricing.inputPer1M + pricing.outputPer1M) / 2
  return (totalTokens / 1_000_000) * blendedPer1M
}

export function checkAssertion(result: RunResult, assertion: Assertion): { pass: boolean; reason?: string } {
  switch (assertion.type) {
    case 'status':
      return result.status === assertion.expected
        ? { pass: true }
        : { pass: false, reason: `expected status "${assertion.expected}", got "${result.status}"` }

    case 'contains': {
      const output = outputFor(result, assertion.nodeId)
      const pass = output.toLowerCase().includes(assertion.value.toLowerCase())
      return pass
        ? { pass: true }
        : {
            pass: false,
            reason: `output${assertion.nodeId ? ` of "${assertion.nodeId}"` : ''} did not contain "${assertion.value}" (got: ${output.slice(0, 200)})`,
          }
    }

    case 'not_contains': {
      const output = outputFor(result, assertion.nodeId)
      const pass = !output.toLowerCase().includes(assertion.value.toLowerCase())
      return pass
        ? { pass: true }
        : { pass: false, reason: `output unexpectedly contained "${assertion.value}"` }
    }

    case 'node_executed': {
      const pass = stepDonesFor(result, assertion.nodeId).length > 0
      return pass ? { pass: true } : { pass: false, reason: `node "${assertion.nodeId}" never completed` }
    }

    case 'node_not_executed': {
      const pass = stepDonesFor(result, assertion.nodeId).length === 0
      return pass
        ? { pass: true }
        : { pass: false, reason: `node "${assertion.nodeId}" executed but should not have` }
    }

    case 'node_execution_count': {
      const actual = stepDonesFor(result, assertion.nodeId).length
      const pass = actual === assertion.count
      return pass
        ? { pass: true }
        : {
            pass: false,
            reason: `node "${assertion.nodeId}" executed ${actual} time(s), expected ${assertion.count}`,
          }
    }

    case 'valid_json': {
      const output = outputFor(result, assertion.nodeId)
      let parsed: unknown
      try {
        parsed = JSON.parse(output)
      } catch {
        return {
          pass: false,
          reason: `output of "${assertion.nodeId}" is not valid JSON: ${output.slice(0, 200)}`,
        }
      }
      if (assertion.schema === 'judgeScore') {
        const validated = judgeScoreSchema.safeParse(parsed)
        if (!validated.success) {
          return {
            pass: false,
            reason: `output of "${assertion.nodeId}" did not match the judgeScore schema: ${z.prettifyError(validated.error)}`,
          }
        }
      }
      return { pass: true }
    }

    case 'max_tokens':
      return result.totalTokens <= assertion.value
        ? { pass: true }
        : { pass: false, reason: `used ${result.totalTokens} tokens, expected <= ${assertion.value}` }

    case 'max_cost_usd': {
      const estimated = estimateCostUsd(result.totalTokens)
      return estimated <= assertion.value
        ? { pass: true }
        : { pass: false, reason: `estimated cost $${estimated.toFixed(6)} exceeded $${assertion.value}` }
    }

    case 'trace_event_present': {
      const pass = result.trace.some(
        (e) => e.type === assertion.eventType && (!assertion.nodeId || (hasNodeId(e) && e.nodeId === assertion.nodeId))
      )
      return pass
        ? { pass: true }
        : {
            pass: false,
            reason: `no "${assertion.eventType}" trace event found${assertion.nodeId ? ` for node "${assertion.nodeId}"` : ''}`,
          }
    }

    case 'trace_event_absent': {
      const pass = !result.trace.some(
        (e) => e.type === assertion.eventType && (!assertion.nodeId || (hasNodeId(e) && e.nodeId === assertion.nodeId))
      )
      return pass ? { pass: true } : { pass: false, reason: `unexpected "${assertion.eventType}" trace event found` }
    }

    case 'run_error_code': {
      const runError = result.trace.find((e): e is RunErrorEvent => e.type === 'run_error')
      const pass = runError?.code === assertion.code
      return pass
        ? { pass: true }
        : {
            pass: false,
            reason: `run_error code was "${runError?.code ?? '(none)'}", expected "${assertion.code}"`,
          }
    }
  }
}
