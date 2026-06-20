import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import type { WorkflowDefinition } from '@/lib/types'
import { embedWorkflow } from '@/lib/rag/embed-workflow'

const createSchema = z.object({
  name: z.string().min(1).max(200),
  definition_json: z.object({
    name: z.string(),
    nodes: z.array(z.unknown()).min(1),
    edges: z.array(z.unknown()),
  }),
})

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('workflows')
    .select('id, name, created_at, definition_json')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ workflows: data })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('workflows')
    .insert({
      name: parsed.data.name,
      definition_json: parsed.data.definition_json as unknown as WorkflowDefinition,
    })
    .select('id, name, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fire-and-forget: embed the new workflow for semantic search
  void embedWorkflow((data as { id: string }).id).catch(() => undefined)

  return NextResponse.json({ workflow: data }, { status: 201 })
}
