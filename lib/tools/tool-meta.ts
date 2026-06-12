/**
 * Client-safe tool metadata derived from each tool's Zod schema descriptions.
 * Import this on the client (e.g. NodeConfigPanel) — it has no server-side deps.
 *
 * Keep in sync with the actual tool schemas when adding/changing tools.
 */

export type FieldMeta = {
  name: string
  label: string
  description: string
  required: boolean
  /** Hint for the placeholder text in the config panel. */
  placeholder: string
}

export type ToolMeta = {
  name: string
  description: string
  fields: FieldMeta[]
}

export const TOOL_META: Record<string, ToolMeta> = {
  web_search: {
    name: 'web_search',
    description: 'Search the web via Tavily and return the top 5 results.',
    fields: [
      {
        name: 'query',
        label: 'Query',
        description: 'The search query',
        required: true,
        placeholder: '{{input_1_output}} company overview',
      },
    ],
  },

  web_fetch: {
    name: 'web_fetch',
    description: 'Fetch a web page by URL and return its visible text content.',
    fields: [
      {
        name: 'url',
        label: 'URL',
        description: 'The full URL to fetch, including protocol (https://...)',
        required: true,
        placeholder: 'https://example.com  or  {{nodeId_output}}',
      },
    ],
  },

  extract_json: {
    name: 'extract_json',
    description: 'Extract structured JSON from unstructured text using an LLM.',
    fields: [
      {
        name: 'text',
        label: 'Text',
        description: 'The unstructured text to extract data from',
        required: true,
        placeholder: '{{search_1_output}}',
      },
      {
        name: 'instructions',
        label: 'Instructions',
        description: 'What to extract and the desired JSON shape',
        required: true,
        placeholder: 'company name, industry, HQ as {name, industry, hq}',
      },
    ],
  },

  send_webhook: {
    name: 'send_webhook',
    description: 'Send an HTTP POST request with a JSON body to a webhook URL.',
    fields: [
      {
        name: 'url',
        label: 'URL',
        description: 'The webhook URL to POST to',
        required: true,
        placeholder: 'https://hooks.example.com/...',
      },
      {
        name: 'payload',
        label: 'Payload',
        description: 'Body to send. Valid JSON is sent as-is; plain text is wrapped.',
        required: true,
        placeholder: '{{email_1_output}}',
      },
    ],
  },

  evaluate_output: {
    name: 'evaluate_output',
    description: 'Score output 1–10 against criteria using an LLM judge.',
    fields: [
      {
        name: 'output',
        label: 'Output to evaluate',
        description: 'The text to score',
        required: true,
        placeholder: '{{email_1_output}}',
      },
      {
        name: 'criteria',
        label: 'Criteria',
        description: 'What a good output looks like (literal rubric or {{nodeId_output}})',
        required: true,
        placeholder: 'mentions industry, HQ location, and has a clear CTA',
      },
    ],
  },
}

/** All registered tool names in display order. */
export const TOOL_NAMES = Object.keys(TOOL_META) as (keyof typeof TOOL_META)[]
