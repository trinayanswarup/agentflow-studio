import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const startRunSchema = z.object({
  workflowId: z.string().uuid(),
  input: z.string().min(1).max(10_000),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = startRunSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }

  const supabase = createServerClient()

  // Verify the workflow exists before creating a run.
  const { error: wfError } = await supabase
    .from('workflows')
    .select('id')
    .eq('id', parsed.data.workflowId)
    .single()

  if (wfError) {
    return NextResponse.json({ error: `Workflow not found: ${wfError.message}` }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('runs')
    .insert({
      workflow_id: parsed.data.workflowId,
      input: parsed.data.input,
      status: 'running',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ runId: data.id }, { status: 201 })
}
