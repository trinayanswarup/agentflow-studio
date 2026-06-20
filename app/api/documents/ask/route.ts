import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { embed } from '@/lib/rag/embeddings'
import { callLLM } from '@/lib/llm/groq'

const bodySchema = z.object({
  docId: z.string().uuid(),
  question: z.string().min(1).max(1000),
})

export interface Source {
  chunkIndex: number
  content: string
}

export interface AskResponse {
  answer: string
  sources: Source[]
}

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

  const { docId, question } = parsed.data
  const supabase = createServerClient()

  // Embed the question
  let questionVec: number[]
  try {
    questionVec = await embed(question)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Embedding failed: ${message}` }, { status: 502 })
  }

  // Fetch all chunks for this document
  const { data: rows, error: chunksErr } = await supabase
    .from('document_chunks')
    .select('chunk_index, content, embedding')
    .eq('doc_id', docId)

  if (chunksErr) {
    return NextResponse.json({ error: chunksErr.message }, { status: 500 })
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Document has no indexed chunks' }, { status: 404 })
  }

  // Score each chunk by cosine similarity
  const scored = rows
    .map((row) => {
      try {
        return {
          chunkIndex: row.chunk_index as number,
          content: row.content as string,
          score: cosineSimilarity(questionVec, parseVector(row.embedding)),
        }
      } catch {
        return null
      }
    })
    .filter((r): r is { chunkIndex: number; content: string; score: number } => r !== null)

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 5)

  // Build prompt with numbered excerpts
  const excerpts = top
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join('\n\n')
  const prompt = `Question: ${question}\n\nExcerpts:\n${excerpts}`
  const system =
    'Answer using only the provided excerpts. For each claim, cite the excerpt number in square brackets, e.g. [1].'

  // Call LLM (Groq → Gemini fallback)
  let answer: string
  try {
    const result = await callLLM({ prompt, system, tools: [] })
    answer = result.text
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `LLM call failed: ${message}` }, { status: 502 })
  }

  const sources: Source[] = top.map((c) => ({
    chunkIndex: c.chunkIndex,
    content: c.content,
  }))

  const responseBody: AskResponse = { answer, sources }
  return NextResponse.json(responseBody)
}
