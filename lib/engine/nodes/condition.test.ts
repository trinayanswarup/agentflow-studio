import { it, expect } from 'vitest'
import { executeCondition } from './condition'
import type { ConditionNode, ExecutionContext } from '@/lib/types'

function conditionNode(expression: string): ConditionNode {
  return { id: 'gate_1', type: 'condition', label: 'Gate', config: { expression } }
}

// evaluate_output returns JSON.stringify({ score, reasoning }).
// The condition must extract the numeric score and compare it correctly.

it('condition with JSON object input extracts score field and evaluates < as true', async () => {
  const context: ExecutionContext = {
    input: 'test',
    quality_1_output: JSON.stringify({ score: 8, reasoning: 'The brief is thin.' }),
  }

  const result = await executeCondition(conditionNode('{{quality_1_output}} < 9'), context)

  expect(result.output).toBe('true')
  expect(result.branch).toBe('true')
})

it('condition with JSON object input evaluates < as false when score meets threshold', async () => {
  const context: ExecutionContext = {
    input: 'test',
    quality_1_output: JSON.stringify({ score: 9, reasoning: 'Excellent brief.' }),
  }

  const result = await executeCondition(conditionNode('{{quality_1_output}} < 9'), context)

  expect(result.output).toBe('false')
  expect(result.branch).toBe('false')
})

it('condition with JSON object input evaluates >= as true for domain risk check', async () => {
  const context: ExecutionContext = {
    input: 'test',
    score_1_output: JSON.stringify({ score: 7, reasoning: 'Known breaches detected.' }),
  }

  const result = await executeCondition(conditionNode('{{score_1_output}} >= 7'), context)

  expect(result.output).toBe('true')
  expect(result.branch).toBe('true')
})

it('condition with plain numeric string compares correctly', async () => {
  const context: ExecutionContext = { input: 'test', score_output: '8' }

  const result = await executeCondition(conditionNode('{{score_output}} < 9'), context)

  expect(result.output).toBe('true')
  expect(result.branch).toBe('true')
})

it('truthiness check on non-empty value returns true', async () => {
  const context: ExecutionContext = { input: 'test', flag_output: 'yes' }

  const result = await executeCondition(conditionNode('{{flag_output}}'), context)

  expect(result.output).toBe('true')
  expect(result.branch).toBe('true')
})
