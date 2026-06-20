import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseFile } from '@/lib/rag/parser'
import { callLLM } from '@/lib/llm/groq'
import type { WorkflowDefinition } from '@/lib/types'

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['input', 'llm_call', 'tool_call', 'condition', 'human_pause', 'output']),
  label: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
})

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.enum(['true', 'false']).optional().nullable(),
})

const workflowSchema = z.object({
  name: z.string().min(1),
  nodes: z.array(nodeSchema).min(2),
  edges: z.array(edgeSchema).min(1),
})

const SYSTEM_PROMPT = `You are a workflow extraction assistant. Read the process document and convert it into a structured AI workflow.

Output ONLY valid JSON (no markdown fences, no explanation) matching this exact schema:
{
  "name": "<short workflow name>",
  "nodes": [
    { "id": "node_1", "type": "input", "label": "User Input", "config": { "placeholder": "Enter your input" } },
    { "id": "node_2", "type": "llm_call", "label": "<step label>", "config": { "prompt": "{{node_1_output}}" } },
    { "id": "node_N", "type": "output", "label": "Result", "config": {} }
  ],
  "edges": [
    { "id": "edge_1", "source": "node_1", "target": "node_2" }
  ]
}

Node type guide:
- "input": the first node — exactly one, always required
- "llm_call": analysis, summarization, writing, scoring, or decision-making steps
- "tool_call": data fetching or external actions (config needs "toolName" string and "args" object)
  For tool_call nodes, the toolName field MUST be exactly one of these values: web_search, web_fetch, extract_json, send_webhook, evaluate_output. Do not invent tool names. Use web_search to search the internet, web_fetch to retrieve a URL, evaluate_output to score content.
- "condition": branching or decision points — must have exactly two outgoing edges with sourceHandle "true" and "false"
- "human_pause": steps requiring human review or approval (config has optional "message" string)
- "output": the last node — exactly one, always required

Rules:
- Always include exactly one "input" node (first) and one "output" node (last)
- Keep node labels concise (2–5 words, title case)
- IDs must be unique: "node_1", "node_2", … and "edge_1", "edge_2", …
- For condition nodes add two edges: one with sourceHandle "true", one with sourceHandle "false"
- Represent each distinct step in the document as its own node`

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
}

function addDefaultPositions(nodes: WorkflowDefinition['nodes']): WorkflowDefinition['nodes'] {
  return nodes.map((node, i) => ({
    ...node,
    position: node.position ?? { x: 400, y: i * 120 + 50 },
  }))
}

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Could not parse form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const lower = file.name.toLowerCase()
  if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) {
    return NextResponse.json({ error: 'Only PDF and DOCX files are supported' }, { status: 400 })
  }

  const filetype = lower.endsWith('.pdf') ? 'pdf' : 'docx'
  const buffer = Buffer.from(await file.arrayBuffer())

  let text: string
  try {
    text = await parseFile(buffer, filetype)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to parse document: ${message}` }, { status: 422 })
  }

  if (!text.trim()) {
    return NextResponse.json(
      { error: 'Could not extract a valid workflow from this document. Try a document with clearer step-by-step structure.' },
      { status: 400 }
    )
  }

  // Truncate to ~3000 words to stay within token budget
  const truncated = text.split(/\s+/).slice(0, 3000).join(' ')

  let raw: string
  try {
    const result = await callLLM({ system: SYSTEM_PROMPT, prompt: truncated, tools: [] })
    raw = result.text
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `LLM call failed: ${message}` }, { status: 502 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripMarkdownFences(raw))
  } catch {
    return NextResponse.json(
      { error: 'Could not extract a valid workflow from this document. Try a document with clearer step-by-step structure.' },
      { status: 400 }
    )
  }

  const validated = workflowSchema.safeParse(parsed)
  if (!validated.success) {
    return NextResponse.json(
      { error: 'Could not extract a valid workflow from this document. Try a document with clearer step-by-step structure.' },
      { status: 400 }
    )
  }

  const VALID_TOOLS = ['web_search', 'web_fetch', 'extract_json', 'send_webhook', 'evaluate_output']

  const normalizedNodes = validated.data.nodes.map((node) => {
    if (node.type !== 'tool_call') return node
    const toolName = typeof node.config.toolName === 'string' ? node.config.toolName : ''
    if (!VALID_TOOLS.includes(toolName)) {
      console.warn(`[import-workflow] Invalid toolName "${toolName}" — replacing with "web_search"`)
      return { ...node, config: { ...node.config, toolName: 'web_search' } }
    }
    return node
  })

  const definition: WorkflowDefinition = {
    name: validated.data.name,
    nodes: addDefaultPositions(normalizedNodes as WorkflowDefinition['nodes']),
    edges: validated.data.edges as WorkflowDefinition['edges'],
  }

  return NextResponse.json({ definition, nodeCount: definition.nodes.length })
}
