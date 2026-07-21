import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getGuardrailEvents } from '@/lib/mcp/server'

const requestSchema = z.object({
  runId: z.string().uuid(),
})

/**
 * POST /api/mcp/get-guardrail-events
 *
 * Thin API route that calls the MCP `get_guardrail_events` tool function
 * directly (no transport overhead) and returns the result as JSON.
 *
 * Request body: { "runId": "<uuid>" }
 * Response:     { "events": GuardrailEventDetail[] } (see lib/mcp/server.ts)
 *
 * Manual test with curl:
 *   curl -s -X POST http://localhost:3000/api/mcp/get-guardrail-events \
 *     -H "Content-Type: application/json" \
 *     -d '{"runId":"<your-run-uuid>"}' | jq .
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
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const events = await getGuardrailEvents(supabase, parsed.data.runId)
    return NextResponse.json({ events })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
