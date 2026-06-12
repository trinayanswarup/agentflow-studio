'use client'

import { useState, useRef } from 'react'
import type { WorkflowDefinition, TraceEvent } from '@/lib/types'

const DEMO_WORKFLOW: WorkflowDefinition = {
  name: 'Lead Enrichment',
  nodes: [
    { id: 'company', type: 'input', label: 'Company Name', config: { placeholder: 'e.g. Nord Security' } },
    {
      id: 'search',
      type: 'tool_call',
      label: 'Research Company',
      config: {
        toolName: 'web_search',
        args: { query: '{{company_output}} company overview industry headquarters funding employees' },
      },
    },
    {
      id: 'has_results',
      type: 'condition',
      label: 'Found Results?',
      config: { expression: '{{search_output}} contains http' },
    },
    {
      id: 'enrich',
      type: 'llm_call',
      label: 'Enrichment Brief',
      config: {
        system:
          'You are a B2B lead-enrichment assistant. You write concise, factual briefs for sales teams. If the research is missing a detail, say "unknown" rather than guessing. You may use the web_fetch tool to read one of the result URLs if the snippets are not enough.',
        prompt:
          'Write a lead-enrichment brief for the company "{{company_output}}" using the research below.\n\nInclude exactly these sections:\n- Industry\n- Headquarters\n- Company size\n- Funding\n- What they sell\n- Three personalized talking points for a sales outreach email\n\nResearch:\n{{search_output}}',
        tools: ['web_fetch'],
      },
    },
    {
      id: 'score',
      type: 'tool_call',
      label: 'Quality Check',
      config: {
        toolName: 'evaluate_output',
        args: {
          output: '{{enrich_output}}',
          criteria:
            'A complete lead-enrichment brief: industry, headquarters, company size, funding, what they sell, and three specific talking points are all present and grounded in the research (not generic filler).',
        },
      },
    },
    {
      id: 'review',
      type: 'human_pause',
      label: 'Human Review',
      config: { message: 'Review the enrichment brief for {{company_output}} before it is finalized.' },
    },
    {
      id: 'final',
      type: 'output',
      label: 'Final Brief',
      config: { template: '{{enrich_output}}\n\n--- Quality check ---\n{{score_output}}' },
    },
    {
      id: 'no_results',
      type: 'output',
      label: 'No Results',
      config: { template: 'No web results found for "{{company_output}}" — cannot enrich this lead.' },
    },
  ],
  edges: [
    { id: 'e1', source: 'company', target: 'search' },
    { id: 'e2', source: 'search', target: 'has_results' },
    { id: 'e3', source: 'has_results', target: 'enrich', sourceHandle: 'true' },
    { id: 'e4', source: 'has_results', target: 'no_results', sourceHandle: 'false' },
    { id: 'e5', source: 'enrich', target: 'score' },
    { id: 'e6', source: 'score', target: 'review' },
    { id: 'e7', source: 'review', target: 'final' },
  ],
}

type RunState = 'idle' | 'starting' | 'streaming' | 'done' | 'error'

export default function TestStreamPage() {
  const [input, setInput] = useState('Nord Security')
  const [state, setState] = useState<RunState>('idle')
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [statusMsg, setStatusMsg] = useState('')
  const esRef = useRef<EventSource | null>(null)

  async function handleRun() {
    if (state === 'streaming' || state === 'starting') return

    setState('starting')
    setEvents([])
    setStatusMsg('Creating workflow…')

    // Seed the workflow.
    const wfRes = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DEMO_WORKFLOW.name, definition_json: DEMO_WORKFLOW }),
    })
    if (!wfRes.ok) {
      setStatusMsg(`Failed to create workflow: ${await wfRes.text()}`)
      setState('error')
      return
    }
    const { workflow } = await wfRes.json() as { workflow: { id: string } }

    setStatusMsg('Starting run…')
    const runRes = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId: workflow.id, input }),
    })
    if (!runRes.ok) {
      setStatusMsg(`Failed to start run: ${await runRes.text()}`)
      setState('error')
      return
    }
    const { runId } = await runRes.json() as { runId: string }

    setStatusMsg(`Streaming run ${runId}…`)
    setState('streaming')

    esRef.current?.close()
    const es = new EventSource(`/api/stream/${runId}`)
    esRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as TraceEvent
      setEvents((prev) => [...prev, event])
      if (event.type === 'run_complete' || event.type === 'run_error') {
        setState(event.type === 'run_complete' ? 'done' : 'error')
        setStatusMsg(event.type === 'run_complete' ? 'Run complete.' : `Error: ${event.error}`)
        es.close()
      }
    }

    es.onerror = () => {
      setState('error')
      setStatusMsg('SSE connection error.')
      es.close()
    }
  }

  return (
    <main style={{ fontFamily: 'monospace', padding: 32, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>AgentFlow — SSE Stream Test</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Company name…"
          style={{
            flex: 1,
            padding: '6px 10px',
            border: '1px solid #555',
            borderRadius: 4,
            background: '#111',
            color: '#eee',
            fontSize: 14,
          }}
        />
        <button
          onClick={handleRun}
          disabled={state === 'starting' || state === 'streaming'}
          style={{
            padding: '6px 18px',
            background: state === 'starting' || state === 'streaming' ? '#333' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: state === 'starting' || state === 'streaming' ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          {state === 'starting' ? 'Starting…' : state === 'streaming' ? 'Running…' : 'Run'}
        </button>
      </div>

      {statusMsg && (
        <p style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>{statusMsg}</p>
      )}

      <pre
        style={{
          background: '#0d0d0d',
          border: '1px solid #333',
          borderRadius: 6,
          padding: 16,
          minHeight: 300,
          maxHeight: 600,
          overflowY: 'auto',
          fontSize: 12,
          color: '#d4d4d4',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {events.length === 0
          ? '// events will appear here…'
          : events.map((e) => JSON.stringify(e, null, 2)).join('\n\n')}
      </pre>
    </main>
  )
}
