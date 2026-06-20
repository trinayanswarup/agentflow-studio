import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export interface DocRecord {
  id: string
  filename: string
  filetype: string
  uploaded_at: string
  chunkCount: number
}

export async function GET() {
  const supabase = createServerClient()

  const [{ data: docs, error: docsErr }, { data: chunkRows, error: chunksErr }] =
    await Promise.all([
      supabase.from('documents').select('id, filename, filetype, uploaded_at').order('uploaded_at', { ascending: false }),
      supabase.from('document_chunks').select('doc_id'),
    ])

  if (docsErr) return NextResponse.json({ error: docsErr.message }, { status: 500 })
  if (chunksErr) return NextResponse.json({ error: chunksErr.message }, { status: 500 })

  const countMap = new Map<string, number>()
  for (const row of chunkRows ?? []) {
    const id = row.doc_id as string
    countMap.set(id, (countMap.get(id) ?? 0) + 1)
  }

  const documents: DocRecord[] = (docs ?? []).map((d) => ({
    id: d.id as string,
    filename: d.filename as string,
    filetype: d.filetype as string,
    uploaded_at: d.uploaded_at as string,
    chunkCount: countMap.get(d.id as string) ?? 0,
  }))

  return NextResponse.json({ documents })
}
