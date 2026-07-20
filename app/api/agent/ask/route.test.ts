/**
 * Tests for POST /api/agent/ask
 *
 * Strategy: mock groq-sdk at the module level so the lazy `groqClient`
 * singleton in the route gets a fake Groq instance whose
 * chat.completions.create we fully control. Also mock Supabase (for the
 * agent_decisions write), agent tools (so they don't hit external APIs),
 * and Langfuse (so no real trace events are fired).
 *
 * The GROQ_API_KEY env var is set to a fake value before imports so
 * getGroqClient()'s API-key guard doesn't throw.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Set env vars before any module is imported ─────────────────────────────
// vitest.config.ts uses loadEnv which picks up .env.local, but tests run
// without a real key. Set a dummy key so getGroqClient() doesn't throw.
process.env.GROQ_API_KEY = 'test-key'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

// ── Hoist mock factories ───────────────────────────────────────────────────

const {
  mockCreate,
  mockCreateServerClient,
  mockSearchDocs,
  mockFetchWorkflowLogs,
  mockStartRunTrace,
  mockFlushObservability,
  mockRecordGeneration,
} = vi.hoisted(() => {
  const mockRunTrace = {
    runNodeSpan: vi.fn((_params: unknown, fn: () => Promise<unknown>) => fn()),
    finish: vi.fn(),
    recordEvent: vi.fn(),
  }
  const mockCreate = vi.fn()
  return {
    mockCreate,
    mockCreateServerClient: vi.fn(),
    mockSearchDocs: vi.fn(),
    mockFetchWorkflowLogs: vi.fn(),
    mockStartRunTrace: vi.fn(() => mockRunTrace),
    mockFlushObservability: vi.fn().mockResolvedValue(undefined),
    mockRecordGeneration: vi.fn(),
  }
})

// ── Module mocks ───────────────────────────────────────────────────────────

// Mock groq-sdk so the Groq constructor returns a fake client.
vi.mock('groq-sdk', () => ({
  default: class MockGroq {
    chat = {
      completions: {
        create: mockCreate,
      },
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: mockCreateServerClient,
}))

// Mock agent tools: preserve the tool metadata (name, description, input_schema)
// but replace execute functions with mocks. Also mock runTool so it calls the
// mocked execute directly.
vi.mock('@/lib/agent/tools', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/agent/tools')>()
  const searchDocsTool = { ...original.searchDocsTool, execute: mockSearchDocs }
  const queryWorkflowLogsTool = { ...original.queryWorkflowLogsTool, execute: mockFetchWorkflowLogs }
  const AGENT_TOOLS = [searchDocsTool, queryWorkflowLogsTool]
  return {
    ...original,
    searchDocsTool,
    queryWorkflowLogsTool,
    AGENT_TOOLS,
    getAgentTool: (name: string) => AGENT_TOOLS.find((t) => t.name === name),
    runTool: vi.fn(async (tool: { execute: (a: unknown) => Promise<string> }, args: unknown) =>
      tool.execute(args)
    ),
  }
})

vi.mock('@/lib/observability/langfuse', () => ({
  startRunTrace: mockStartRunTrace,
  flushObservability: mockFlushObservability,
  recordGeneration: mockRecordGeneration,
}))

// Import AFTER all mocks are registered.
import { POST } from '@/app/api/agent/ask/route'

// ── Helpers ────────────────────────────────────────────────────────────────

const WORKFLOW_UUID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/agent/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function groqToolCallResponse(toolName: string, args: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_abc',
              type: 'function',
              function: { name: toolName, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
    usage: { total_tokens: 42 },
  }
}

function groqTextResponse(text: string) {
  return {
    choices: [{ message: { role: 'assistant', content: text, tool_calls: undefined } }],
    usage: { total_tokens: 20 },
  }
}

function makeSupabaseMock(): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateServerClient.mockReturnValue(makeSupabaseMock())
  // Re-apply the resolved value after clearAllMocks resets it.
  mockFlushObservability.mockResolvedValue(undefined)
  const mockRunTrace = {
    runNodeSpan: vi.fn((_params: unknown, fn: () => Promise<unknown>) => fn()),
    finish: vi.fn(),
    recordEvent: vi.fn(),
  }
  mockStartRunTrace.mockReturnValue(mockRunTrace)
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/agent/ask', () => {
  it('calls search_docs when the question is about finding a workflow', async () => {
    const searchResult = JSON.stringify([
      { workflowId: 'wf-1', name: 'Lead Qualification', score: 0.92 },
    ])
    mockSearchDocs.mockResolvedValue(searchResult)
    mockCreate
      .mockResolvedValueOnce(groqToolCallResponse('search_docs', { query: 'lead qualification' }))
      .mockResolvedValueOnce(groqTextResponse('I found the Lead Qualification workflow.'))

    const req = makeRequest({ question: 'Do you have a workflow for qualifying sales leads?' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { answer: string; toolCalled: string }
    expect(body.toolCalled).toBe('search_docs')
    expect(typeof body.answer).toBe('string')
    expect(body.answer.length).toBeGreaterThan(0)
    expect(mockSearchDocs).toHaveBeenCalledWith({ query: 'lead qualification' })
  })

  it('calls query_workflow_logs when the question is about a specific workflow run history', async () => {
    const logsResult = JSON.stringify([{ run_id: 'run-1', status: 'completed', steps: [] }])
    mockFetchWorkflowLogs.mockResolvedValue(logsResult)
    mockCreate
      .mockResolvedValueOnce(
        groqToolCallResponse('query_workflow_logs', { workflowId: WORKFLOW_UUID })
      )
      .mockResolvedValueOnce(groqTextResponse('The workflow ran successfully.'))

    const req = makeRequest({
      question: `What happened in the last run of workflow ${WORKFLOW_UUID}?`,
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { toolCalled: string }
    expect(body.toolCalled).toBe('query_workflow_logs')
    expect(mockFetchWorkflowLogs).toHaveBeenCalledWith({ workflowId: WORKFLOW_UUID })
  })

  it('returns a direct answer with no tool call for a general question', async () => {
    mockCreate.mockResolvedValueOnce(
      groqTextResponse('AgentFlow Studio is a visual AI workflow builder.')
    )

    const req = makeRequest({ question: 'What is AgentFlow Studio?' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { answer: string; toolCalled: string | null }
    expect(body.toolCalled).toBeNull()
    expect(body.answer).toBe('AgentFlow Studio is a visual AI workflow builder.')
    expect(mockSearchDocs).not.toHaveBeenCalled()
    expect(mockFetchWorkflowLogs).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('handles tool_use_failed by retrying without tools', async () => {
    // Attach status: 400 so withRetry doesn't retry it (400 is not retryable).
    const toolUseFailedError = Object.assign(
      new Error('tool_use_failed: model called a nonexistent tool'),
      { status: 400 }
    )
    // First call throws tool_use_failed; retry without tools should succeed.
    mockCreate
      .mockRejectedValueOnce(toolUseFailedError)
      .mockResolvedValueOnce(groqTextResponse('Here is your answer without tool use.'))

    const req = makeRequest({ question: 'Tell me something.' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { answer: string; toolCalled: string | null }
    expect(body.toolCalled).toBeNull()
    expect(body.answer).toBe('Here is your answer without tool use.')
    // Two calls: first with tools (tool_use_failed), second without tools.
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('returns 400 for an empty question', async () => {
    const req = makeRequest({ question: '' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(typeof body.error).toBe('string')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when question field is missing', async () => {
    const req = makeRequest({})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('writes a row to agent_decisions on success', async () => {
    mockCreate.mockResolvedValueOnce(groqTextResponse('Direct answer.'))
    const supabaseMock = makeSupabaseMock()
    mockCreateServerClient.mockReturnValue(supabaseMock)

    const req = makeRequest({ question: 'Hello?' })
    const res = await POST(req)
    expect(res.status).toBe(200)

    // Give the fire-and-forget a tick to flush.
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(supabaseMock.from).toHaveBeenCalledWith('agent_decisions')
    const insertMock = (supabaseMock.from as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
      insert: ReturnType<typeof vi.fn>
    }
    expect(insertMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Hello?',
        final_answer: 'Direct answer.',
      })
    )
  })

  it('records Langfuse generation observations on each LLM call', async () => {
    mockCreate.mockResolvedValueOnce(groqTextResponse('Answer.'))

    const req = makeRequest({ question: 'Quick question.' })
    await POST(req)

    expect(mockRecordGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'groq' })
    )
    expect(mockStartRunTrace).toHaveBeenCalledWith(
      expect.objectContaining({ workflowName: 'ask-agent', input: 'Quick question.' })
    )
  })
})
