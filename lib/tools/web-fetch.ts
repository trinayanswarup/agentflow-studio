import { z } from 'zod'
import { defineTool, registerTool } from '@/lib/tools/registry'

const MAX_CHARS = 2000
const FETCH_TIMEOUT_MS = 15_000

const schema = z.object({
  url: z.url().describe('The full URL to fetch, including protocol (https://...)'),
})

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export const webFetchTool = defineTool({
  name: 'web_fetch',
  description:
    'Fetch a web page by URL and return its visible text content (HTML stripped, max 2000 characters). Use for reading a specific page.',
  schema,
  execute: async ({ url }) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'AgentFlowStudio/0.1 (+https://github.com)' },
      redirect: 'follow',
    })
    if (!response.ok) {
      throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`)
    }
    const body = await response.text()
    const text = stripHtml(body)
    if (!text) return `(no readable text content at ${url})`
    return text.slice(0, MAX_CHARS)
  },
})

registerTool(webFetchTool)
