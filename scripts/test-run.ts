/**
 * Session 1 smoke test: runs a hardcoded lead-enrichment workflow from the CLI.
 *
 *   npx tsx scripts/test-run.ts            # uses default input "Nord Security"
 *   npx tsx scripts/test-run.ts "Enpal"    # custom company name
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.local before importing anything that reads env vars.
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const [, key, raw] = match
    if (process.env[key]) continue
    process.env[key] = raw.replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

import type { TraceEvent, WorkflowDefinition } from '../lib/types'
import { WorkflowRunner } from '../lib/engine/runner'
import { flushObservability } from '../lib/observability/langfuse'

const leadEnrichmentWorkflow: WorkflowDefinition = {
  name: 'Lead Enrichment',
  nodes: [
    {
      id: 'company',
      type: 'input',
      label: 'Company Name',
      config: { placeholder: 'e.g. Nord Security' },
    },
    {
      id: 'search',
      type: 'tool_call',
      label: 'Research Company',
      config: {
        toolName: 'web_search',
        args: { query: '{{company_output}} company overview industry headquarters funding employees' },
      },
    },
    {
      id: 'has_results',
      type: 'condition',
      label: 'Found Results?',
      config: { expression: '{{search_output}} contains http' },
    },
    {
      id: 'enrich',
      type: 'llm_call',
      label: 'Enrichment Brief',
      config: {
        system:
          'You are a B2B lead-enrichment assistant. You write concise, factual briefs for sales teams. If the research is missing a detail, say "unknown" rather than guessing. You may use the web_fetch tool to read one of the result URLs if the snippets are not enough.',
        prompt:
          'Write a lead-enrichment brief for the company "{{company_output}}" using the research below.\n\nInclude exactly these sections:\n- Industry\n- Headquarters\n- Company size\n- Funding\n- What they sell\n- Three personalized talking points for a sales outreach email\n\nResearch:\n{{search_output}}',
        tools: ['web_fetch'],
      },
    },
    {
      id: 'score',
      type: 'tool_call',
      label: 'Quality Check',
      config: {
        toolName: 'evaluate_output',
        args: {
          output: '{{enrich_output}}',
          criteria:
            'A complete lead-enrichment brief: industry, headquarters, company size, funding, what they sell, and three specific talking points are all present and grounded in the research (not generic filler).',
        },
      },
    },
    {
      id: 'review',
      type: 'human_pause',
      label: 'Human Review',
      config: { message: 'Review the enrichment brief for {{company_output}} before it is finalized.' },
    },
    {
      id: 'final',
      type: 'output',
      label: 'Final Brief',
      config: { template: '{{enrich_output}}\n\n--- Quality check ---\n{{score_output}}' },
    },
    {
      id: 'no_results',
      type: 'output',
      label: 'No Results',
      config: { template: 'No web results found for "{{company_output}}" — cannot enrich this lead.' },
    },
  ],
  edges: [
    { id: 'e1', source: 'company', target: 'search' },
    { id: 'e2', source: 'search', target: 'has_results' },
    { id: 'e3', source: 'has_results', target: 'enrich', sourceHandle: 'true' },
    { id: 'e4', source: 'has_results', target: 'no_results', sourceHandle: 'false' },
    { id: 'e5', source: 'enrich', target: 'score' },
    { id: 'e6', source: 'score', target: 'review' },
    { id: 'e7', source: 'review', target: 'final' },
  ],
}

function preview(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function printTrace(event: TraceEvent): void {
  switch (event.type) {
    case 'run_start':
      console.log(`\n▶ run_start      ${event.workflowName} — input: "${event.input}"\n`)
      break
    case 'step_start':
      console.log(`⏳ step_start     [${event.nodeType}] ${event.label}`)
      break
    case 'step_done':
      console.log(
        `✅ step_done      [${event.nodeType}] ${event.label} — ${event.latencyMs}ms, ${event.tokens} tokens`
      )
      console.log(`                  ${preview(event.output)}`)
      break
    case 'step_error':
      console.log(`❌ step_error     ${event.label} — ${event.error} (${event.latencyMs}ms)`)
      break
    case 'human_pause':
      console.log(`⏸  human_pause    ${event.label} — ${event.message}`)
      break
    case 'run_complete':
      console.log(
        `\n■ run_complete   ${event.totalLatencyMs}ms total, ${event.totalTokens} tokens total`
      )
      break
    case 'run_error':
      console.log(`\n■ run_error      ${event.error}`)
      break
  }
}

async function main(): Promise<void> {
  for (const key of ['GROQ_API_KEY', 'TAVILY_API_KEY']) {
    if (!process.env[key]) {
      console.error(`Missing ${key} — add it to .env.local before running.`)
      process.exit(1)
    }
  }

  const input = process.argv[2] ?? 'Nord Security'
  const runner = new WorkflowRunner(leadEnrichmentWorkflow, undefined, { source: 'cli' })
  runner.on('trace', printTrace)

  const result = await runner.run(input)
  await flushObservability()

  console.log('\n================ FINAL OUTPUT ================\n')
  console.log(result.output)
  console.log('\n==============================================')
  console.log(
    `status=${result.status}  steps=${result.trace.filter((e) => e.type === 'step_done').length}  tokens=${result.totalTokens}  latency=${result.totalLatencyMs}ms`
  )

  process.exit(result.status === 'completed' ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
