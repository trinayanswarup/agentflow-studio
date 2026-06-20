import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const supabase = createServerClient()

  const { data: share, error: shareError } = await supabase
    .from('workflow_shares')
    .select('workflow_id')
    .eq('slug', params.slug)
    .eq('is_public', true)
    .single()

  if (shareError || !share) {
    return NextResponse.json({ error: 'Share link not found' }, { status: 404 })
  }

  const { data: workflow, error: wfError } = await supabase
    .from('workflows')
    .select('id, name, definition_json')
    .eq('id', (share as { workflow_id: string }).workflow_id)
    .single()

  if (wfError || !workflow) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  }

  return NextResponse.json({
    name: (workflow as { name: string }).name,
    definition: (workflow as { definition_json: unknown }).definition_json,
  })
}
