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
  const trimmed = value.trim()
  if (trimmed === '') return null

  // Direct numeric strings ("7", "  3.5 ") parse cleanly.
  const direct = Number(trimmed)
  if (Number.isFinite(direct)) return direct

  // If the value looks like JSON (e.g. evaluate_output returns
  // {"score":8,"reasoning":"..."}), parse it and use the 'score' key directly.
  if (trimmed.includes('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'score' in parsed &&
        typeof (parsed as Record<string, unknown>).score === 'number'
      ) {
        const score = (parsed as Record<string, unknown>).score as number
        console.error(`[condition] asNumber: extracted score=${score} from JSON (input="${trimmed.slice(0, 80)}")`)
        return score
      }
    } catch {
      // Not valid JSON — fall through to regex.
    }
  }

  // Regex fallback: pull the first number from any structured string.
  const match = trimmed.match(/-?\d+(?:\.\d+)?/)
  const result = match ? Number(match[0]) : null
  console.error(`[condition] asNumber: regex extracted ${result} from input="${trimmed.slice(0, 80)}"`)
  return result
}

function compare(left: string, operator: string, right: string): boolean {
  const leftNum = asNumber(left)
  const rightNum = asNumber(right)
  const bothNumeric = leftNum !== null && rightNum !== null

  console.error(
    `[condition] comparing: "${left.slice(0, 60)}" ${operator} "${right}" → leftNum=${leftNum}, rightNum=${rightNum}, bothNumeric=${bothNumeric}`
  )

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
