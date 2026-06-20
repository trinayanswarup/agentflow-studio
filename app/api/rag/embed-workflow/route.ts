import { NextResponse } from 'next/server'
import { z } from 'zod'
import { embedWorkflow } from '@/lib/rag/embed-workflow'

const bodySchema = z.object({
  workflowId: z.string().uuid(),
})

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

  const { workflowId } = parsed.data

  try {
    await embedWorkflow(workflowId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ success: true, workflowId })
}
