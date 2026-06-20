import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const slug = nanoid(8)
  const supabase = createServerClient()

  const { error } = await supabase.from('workflow_shares').insert({
    workflow_id: params.id,
    slug,
    is_public: true,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  return NextResponse.json({ slug, url: `${base}/share/${slug}` })
}
