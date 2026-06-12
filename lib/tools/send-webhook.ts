import { z } from 'zod'
import { defineTool, registerTool } from '@/lib/tools/registry'

const TIMEOUT_MS = 15_000
const MAX_RESPONSE_CHARS = 500

const schema = z.object({
  url: z.url().describe('The webhook URL to POST to'),
  payload: z
    .string()
    .min(1)
    .describe('The body to send. A JSON string is sent as-is; plain text is wrapped as {"message": ...}'),
})

export const sendWebhookTool = defineTool({
  name: 'send_webhook',
  description: 'Send an HTTP POST request with a JSON body to a webhook URL.',
  schema,
  execute: async ({ url, payload }) => {
    let body: string
    try {
      JSON.parse(payload)
      body = payload
    } catch {
      body = JSON.stringify({ message: payload })
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const responseText = (await response.text()).slice(0, MAX_RESPONSE_CHARS)
    if (!response.ok) {
      throw new Error(`Webhook failed: HTTP ${response.status} — ${responseText}`)
    }
    return `Webhook delivered: HTTP ${response.status}${responseText ? ` — ${responseText}` : ''}`
  },
})

registerTool(sendWebhookTool)
