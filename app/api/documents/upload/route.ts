import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseFile } from '@/lib/rag/parser'
import { chunkText } from '@/lib/rag/chunker'
import { embed } from '@/lib/rag/embeddings'

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

function detectFiletype(filename: string): 'pdf' | 'docx' | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.docx')) return 'docx'
  return null
}

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Could not parse form data' }, { status: 400 })
  }

  const fileField = formData.get('file')
  if (!(fileField instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 })
  }

  const file = fileField
  const filetype = detectFiletype(file.name)
  if (!filetype) {
    return NextResponse.json({ error: 'Only PDF and DOCX files are accepted' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds the 10 MB limit' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  }

  // Convert to Buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Parse text
  let text: string
  try {
    text = await parseFile(buffer, filetype)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to parse file: ${message}` }, { status: 422 })
  }

  if (!text.trim()) {
    return NextResponse.json({ error: 'No text content found in file' }, { status: 422 })
  }

  // Chunk text
  const chunks = chunkText(text, 500, 50)

  // Embed all chunks sequentially
  const embeddings: number[][] = []
  try {
    for (const chunk of chunks) {
      embeddings.push(await embed(chunk))
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Embedding failed: ${message}` }, { status: 502 })
  }

  const supabase = createServerClient()

  // Insert document row
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ filename: file.name, filetype })
    .select('id')
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: docErr?.message ?? 'Failed to insert document' }, { status: 500 })
  }

  const docId = doc.id as string

  // Insert all chunks in one batch
  const chunkRows = chunks.map((content, i) => ({
    doc_id: docId,
    chunk_index: i,
    content,
    embedding: `[${embeddings[i].join(',')}]`,
  }))

  const { error: chunksErr } = await supabase.from('document_chunks').insert(chunkRows)
  if (chunksErr) {
    return NextResponse.json({ error: chunksErr.message }, { status: 500 })
  }

  return NextResponse.json({ docId, filename: file.name, chunkCount: chunks.length }, { status: 201 })
}
