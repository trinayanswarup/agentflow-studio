import { tavily, type TavilyClient } from '@tavily/core'
import { z } from 'zod'
import { defineTool, registerTool } from '@/lib/tools/registry'

const MAX_RESULTS = 5
const SNIPPET_CHARS = 400

const schema = z.object({
  query: z.string().min(1).describe('The search query'),
})

let client: TavilyClient | null = null

function getClient(): TavilyClient {
  if (!client) {
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) throw new Error('TAVILY_API_KEY is not set')
    client = tavily({ apiKey })
  }
  return client
}

export const webSearchTool = defineTool({
  name: 'web_search',
  description:
    'Search the web via Tavily and return the top 5 results (title, URL, content snippet). Use for finding current information.',
  schema,
  execute: async ({ query }) => {
    const response = await getClient().search(query, { maxResults: MAX_RESULTS })
    if (!response.results || response.results.length === 0) {
      return `No search results found for "${query}".`
    }
    return response.results
      .slice(0, MAX_RESULTS)
      .map(
        (result, index) =>
          `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.content.slice(0, SNIPPET_CHARS)}`
      )
      .join('\n\n')
  },
})

registerTool(webSearchTool)
