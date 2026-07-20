import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { queryWorkflowLogs } from '@/lib/mcp/server'

const requestSchema = z.object({
  workflowId: z.string().uuid(),
})

/**
 * POST /api/mcp/query-workflow-logs
 *
 * Thin API route that calls the MCP `query_workflow_logs` tool function
 * directly (no transport overhead) and returns the result as JSON.
 *
 * Request body: { "workflowId": "<uuid>" }
 * Response:     { "logs": RunLog[] }
 *
 * Manual test with curl:
 *   curl -s -X POST http://localhost:3000/api/mcp/query-workflow-logs \
 *     -H "Content-Type: application/json" \
 *     -d '{"workflowId":"<your-workflow-uuid>"}' | jq .
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 }
    )
  }

  const supabase = createServerClient()

  try {
    const logs = await queryWorkflowLogs(supabase, parsed.data.workflowId)
    return NextResponse.json({ logs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
