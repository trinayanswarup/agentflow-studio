import type { ExecutionContext } from '@/lib/types'

/** Create the shared context for a run. `input` is a reserved key. */
export function createContext(input: string, runId?: string): ExecutionContext {
  const ctx: ExecutionContext = { input }
  if (runId) ctx['__runId'] = runId
  return ctx
}

export function setNodeOutput(context: ExecutionContext, nodeId: string, value: unknown): void {
  context[`${nodeId}_output`] = value
}

export function getNodeOutput(context: ExecutionContext, nodeId: string): unknown {
  return context[`${nodeId}_output`]
}

/**
 * Resolve `{{key}}` placeholders against the context.
 * Keys are `input` or `${nodeId}_output`. Unknown keys resolve to an empty
 * string so a half-built workflow degrades instead of crashing.
 */
export function resolveTemplate(template: string, context: ExecutionContext): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = context[key]
    if (value === undefined || value === null) return ''
    return typeof value === 'string' ? value : JSON.stringify(value)
  })
}
