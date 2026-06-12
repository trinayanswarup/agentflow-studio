import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const approveSchema = z.object({
  action: z.enum(['approve', 'reject']),
  editedOutput: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: { runId: string } }
): Promise<NextResponse> {
  const { runId } = params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = approveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }

  const { action, editedOutput } = parsed.data
  const supabase = createServerClient()

  // Verify run exists.
  const { data: run, error: runError } = await supabase
    .from('runs')
    .select('id, status')
    .eq('id', runId)
    .single()

  if (runError || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  // Extract nodeId from the run_steps row that is currently waiting.
  const { data: waitingStep, error: stepError } = await supabase
    .from('run_steps')
    .select('node_id')
    .eq('run_id', runId)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (stepError) {
    return NextResponse.json({ error: 'Failed to look up waiting step' }, { status: 500 })
  }

  if (!waitingStep) {
    return NextResponse.json({ error: 'No waiting step found for this run' }, { status: 409 })
  }

  // Insert the approval decision — the engine polls this table.
  const { error: insertError } = await supabase.from('human_approvals').insert({
    run_id: runId,
    node_id: waitingStep.node_id,
    action,
    edited_output: editedOutput ?? null,
  })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Update run status back to running (or failed on reject).
  await supabase
    .from('runs')
    .update({ status: action === 'approve' ? 'running' : 'failed' })
    .eq('id', runId)

  return NextResponse.json({ ok: true })
}
