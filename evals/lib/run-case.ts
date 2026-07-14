import { WorkflowRunner } from '@/lib/engine/runner'
import { getTemplate } from '@/lib/templates'
import { checkAssertion } from './assertions'
import type { CaseResult, EvalCase } from './types'

/** Runs one case's workflow through the real engine and checks its assertions. */
export async function executeCase(evalCase: EvalCase): Promise<CaseResult> {
  const template = getTemplate(evalCase.template)
  if (!template) {
    return {
      id: evalCase.id,
      description: evalCase.description,
      tags: evalCase.tags,
      pass: false,
      reason: `Unknown template "${evalCase.template}"`,
      latencyMs: 0,
      assertionResults: [],
    }
  }

  const started = Date.now()
  const runner = new WorkflowRunner(template.definition, undefined, { source: 'cli' })
  const result = await runner.run(evalCase.input)
  const latencyMs = Date.now() - started

  const assertionResults = evalCase.assertions.map((assertion) => ({
    assertion,
    ...checkAssertion(result, assertion),
  }))
  const failures = assertionResults.filter((a) => !a.pass)

  return {
    id: evalCase.id,
    description: evalCase.description,
    tags: evalCase.tags,
    pass: failures.length === 0,
    reason: failures.length > 0 ? failures.map((f) => f.reason).join('; ') : undefined,
    latencyMs,
    assertionResults,
  }
}
