import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { embed } from '@/lib/rag/embeddings'

export interface SearchResult {
  workflowId: string
  name: string
  content: string
  score: number
}

const bodySchema = z.object({
  query: z.string().min(1).max(500),
})

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function parseVector(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[]
  if (typeof v === 'string') return JSON.parse(v) as number[]
  throw new Error(`Cannot parse vector: ${typeof v}`)
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }

  const { query } = parsed.data

  let queryVec: number[]
  try {
    queryVec = await embed(query)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Embedding failed: ${message}` }, { status: 502 })
  }

  const supabase = createServerClient()

  const { data: embeddings, error: embErr } = await supabase
    .from('workflow_embeddings')
    .select('workflow_id, content, embedding')

  if (embErr) {
    return NextResponse.json({ error: embErr.message }, { status: 500 })
  }

  if (!embeddings || embeddings.length === 0) {
    return NextResponse.json({ results: [] as SearchResult[] })
  }

  // Compute cosine similarity in JS
  const scored = embeddings.map((row) => {
    let vec: number[]
    try {
      vec = parseVector(row.embedding)
    } catch {
      return null
    }
    return {
      workflowId: row.workflow_id as string,
      content: row.content as string,
      score: cosineSimilarity(queryVec, vec),
    }
  }).filter((r): r is { workflowId: string; content: string; score: number } => r !== null)

  // Sort by score desc, take top 5
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 5)

  if (top.length === 0) {
    return NextResponse.json({ results: [] as SearchResult[] })
  }

  // Join with workflows for names
  const ids = top.map((r) => r.workflowId)
  const { data: workflows, error: wfErr } = await supabase
    .from('workflows')
    .select('id, name')
    .in('id', ids)

  if (wfErr) {
    return NextResponse.json({ error: wfErr.message }, { status: 500 })
  }

  const nameMap = new Map<string, string>()
  for (const wf of workflows ?? []) {
    nameMap.set(wf.id as string, wf.name as string)
  }

  const results: SearchResult[] = top
    .filter((r) => nameMap.has(r.workflowId))
    .map((r) => ({
      workflowId: r.workflowId,
      name: nameMap.get(r.workflowId) ?? r.workflowId,
      content: r.content,
      score: r.score,
    }))

  return NextResponse.json({ results })
}
