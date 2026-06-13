import type { ConditionNode, ExecutionContext, NodeExecutionResult } from '@/lib/types'
import { resolveTemplate } from '@/lib/engine/context'

// Operators are parsed from the raw (unresolved) expression so that resolved
// values containing spaces or operator-like text cannot break parsing.
const OPERATOR_PATTERN = /\s+(contains|not_contains|==|!=|>=|<=|>|<)\s+/

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function asNumber(value: string): number | null {
  if (value.trim() === '') return null
  // Direct numeric strings ("7", "  3.5 ") parse cleanly.
  const direct = Number(value)
  if (Number.isFinite(direct)) return direct
  // Fallback: pull the first number out of a structured string. This lets a
  // condition compare against an LLM-judge result like {"score":7,"reasoning":…}
  // — evaluate_output stringifies score first, so the first number is the score.
  const match = value.match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function compare(left: string, operator: string, right: string): boolean {
  const leftNum = asNumber(left)
  const rightNum = asNumber(right)
  const bothNumeric = leftNum !== null && rightNum !== null

  switch (operator) {
    case 'contains':
      return left.toLowerCase().includes(right.toLowerCase())
    case 'not_contains':
      return !left.toLowerCase().includes(right.toLowerCase())
    case '==':
      return bothNumeric ? leftNum === rightNum : left === right
    case '!=':
      return bothNumeric ? leftNum !== rightNum : left !== right
    case '>=':
      return bothNumeric && leftNum >= rightNum
    case '<=':
      return bothNumeric && leftNum <= rightNum
    case '>':
      return bothNumeric && leftNum > rightNum
    case '<':
      return bothNumeric && leftNum < rightNum
    default:
      return false
  }
}

export async function executeCondition(
  node: ConditionNode,
  context: ExecutionContext
): Promise<NodeExecutionResult> {
  const expression = node.config.expression
  const match = OPERATOR_PATTERN.exec(expression)

  let result: boolean
  if (!match) {
    // No operator — truthiness check on the resolved value.
    const value = resolveTemplate(expression, context).trim()
    result = value !== '' && value.toLowerCase() !== 'false' && value !== '0'
  } else {
    const left = unquote(resolveTemplate(expression.slice(0, match.index), context))
    const right = unquote(resolveTemplate(expression.slice(match.index + match[0].length), context))
    result = compare(left, match[1], right)
  }

  return { output: String(result), tokensUsed: 0, branch: result ? 'true' : 'false' }
}
