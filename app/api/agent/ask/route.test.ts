/**
 * Tests for POST /api/agent/ask
 *
 * Strategy: mock groq-sdk at the module level so the lazy `groqClient`
 * singleton in the route gets a fake Groq instance whose
 * chat.completions.create we fully control (used by the general
 * search_docs/no-tool path, runAgentLoop). Also mock Supabase (for the
 * agent_decisions write), agent tools (so they don't hit external APIs),
 * Langfuse (so no real trace events are fired), and callLLMStructured (the
 * run-diagnosis synthesis step) — its own internals are covered by
 * lib/llm/structured-output.test.ts, so here it's treated as a black box.
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
  mockGetRunDetails,
  mockGetGuardrailEvents,
  mockStartRunTrace,
  mockFlushObservability,
  mockRecordGeneration,
  mockCallLLMStructured,
  mockRunTraceRecordEvent,
} = vi.hoisted(() => {
  const mockRunTraceRecordEvent = vi.fn()
  const mockRunTrace = {
    runNodeSpan: vi.fn((_params: unknown, fn: () => Promise<unknown>) => fn()),
    finish: vi.fn(),
    recordEvent: mockRunTraceRecordEvent,
  }
  const mockCreate = vi.fn()
  return {
    mockCreate,
    mockCreateServerClient: vi.fn(),
    mockSearchDocs: vi.fn(),
    mockGetRunDetails: vi.fn(),
    mockGetGuardrailEvents: vi.fn(),
    mockStartRunTrace: vi.fn(() => mockRunTrace),
    mockFlushObservability: vi.fn().mockResolvedValue(undefined),
    mockRecordGeneration: vi.fn(),
    mockCallLLMStructured: vi.fn(),
    mockRunTraceRecordEvent,
  }
})

// ── Module mocks ───────────────────────────────────────────────────────────

// Mock groq-sdk so the Groq constructor returns a fake client (used by the
// general search_docs/no-tool path's raw-SDK loop).
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
  const getRunDetailsTool = { ...original.getRunDetailsTool, execute: mockGetRunDetails }
  const getGuardrailEventsTool = { ...original.getGuardrailEventsTool, execute: mockGetGuardrailEvents }
  const AGENT_TOOLS = [searchDocsTool, getRunDetailsTool, getGuardrailEventsTool]
  return {
    ...original,
    searchDocsTool,
    getRunDetailsTool,
    getGuardrailEventsTool,
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

vi.mock('@/lib/llm/structured-output', () => ({
  callLLMStructured: mockCallLLMStructured,
}))

// Import AFTER all mocks are registered.
import { POST } from '@/app/api/agent/ask/route'

// ── Helpers ────────────────────────────────────────────────────────────────

const RUN_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffffffffffff'

const VALID_DIAGNOSIS = {
  summary: 'The run failed at the Score Check step.',
  failedStep: 'Score Check',
  evidence: ['Score Check reported status "error"', 'Extract Profile produced malformed JSON'],
  likelyCause: 'Extract Profile returned output that was not valid JSON.',
  confidence: 'high' as const,
  recommendations: ['Add stricter output validation to Extract Profile'],
}

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
    recordEvent: mockRunTraceRecordEvent,
  }
  mockStartRunTrace.mockReturnValue(mockRunTrace)
  mockCallLLMStructured.mockResolvedValue({
    data: VALID_DIAGNOSIS,
    result: { text: JSON.stringify(VALID_DIAGNOSIS), tokensUsed: 150, toolCalls: [], provider: 'groq' },
  })
})

// ── Tests: general question path (unchanged) ─────────────────────────────────

describe('POST /api/agent/ask — general questions (unchanged)', () => {
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
    const body = (await res.json()) as { answer: string; toolCalled: string; diagnosis?: unknown }
    expect(body.toolCalled).toBe('search_docs')
    expect(typeof body.answer).toBe('string')
    expect(body.answer.length).toBeGreaterThan(0)
    expect(body.diagnosis).toBeUndefined()
    expect(mockSearchDocs).toHaveBeenCalledWith({ query: 'lead qualification' })
    expect(mockGetRunDetails).not.toHaveBeenCalled()
    expect(mockCallLLMStructured).not.toHaveBeenCalled()
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
    expect(mockGetRunDetails).not.toHaveBeenCalled()
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

// ── Tests: run-diagnosis path (new) ───────────────────────────────────────────

describe('POST /api/agent/ask — run diagnosis', () => {
  it('always calls get_run_details first when an explicit runId is supplied', async () => {
    mockGetRunDetails.mockResolvedValue(JSON.stringify({ runId: RUN_UUID, status: 'completed', failedStep: null }))

    const req = makeRequest({ question: 'What happened in this run?', runId: RUN_UUID })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockGetRunDetails).toHaveBeenCalledWith({ runId: RUN_UUID })
    // Never asked Groq to decide anything for this path — no raw completion call at all.
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('always calls get_run_details first when a runId is extracted from the question text', async () => {
    mockGetRunDetails.mockResolvedValue(JSON.stringify({ runId: RUN_UUID, status: 'completed', failedStep: null }))

    const req = makeRequest({ question: `What happened in the last run of workflow ${RUN_UUID}?` })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockGetRunDetails).toHaveBeenCalledWith({ runId: RUN_UUID })
  })

  it('never calls callLLMStructured before get_run_details has returned', async () => {
    const callOrder: string[] = []
    mockGetRunDetails.mockImplementation(async () => {
      callOrder.push('get_run_details')
      return JSON.stringify({ runId: RUN_UUID, status: 'completed', failedStep: null })
    })
    mockCallLLMStructured.mockImplementation(async () => {
      callOrder.push('callLLMStructured')
      return { data: VALID_DIAGNOSIS, result: { text: '', tokensUsed: 10, toolCalls: [], provider: 'groq' } }
    })

    const req = makeRequest({ question: 'Diagnose this run.', runId: RUN_UUID })
    await POST(req)

    expect(callOrder).toEqual(['get_run_details', 'callLLMStructured'])
  })

  it('calls get_guardrail_events when the run has a failed step', async () => {
    mockGetRunDetails.mockResolvedValue(
      JSON.stringify({ runId: RUN_UUID, status: 'failed', failedStep: { nodeId: 'n1', nodeLabel: 'Score Check' } })
    )
    mockGetGuardrailEvents.mockResolvedValue(JSON.stringify([]))

    const req = makeRequest({ question: 'Why did this run fail?', runId: RUN_UUID })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockGetGuardrailEvents).toHaveBeenCalledWith({ runId: RUN_UUID })
  })

  it('does NOT call get_guardrail_events when the run succeeded (no failedStep)', async () => {
    mockGetRunDetails.mockResolvedValue(JSON.stringify({ runId: RUN_UUID, status: 'completed', failedStep: null }))

    const req = makeRequest({ question: 'What happened in this run?', runId: RUN_UUID })
    await POST(req)

    expect(mockGetGuardrailEvents).not.toHaveBeenCalled()
  })

  it('returns a structured diagnosis validated against DiagnosisSchema', async () => {
    mockGetRunDetails.mockResolvedValue(
      JSON.stringify({ runId: RUN_UUID, status: 'failed', failedStep: { nodeId: 'n1', nodeLabel: 'Score Check' } })
    )
    mockGetGuardrailEvents.mockResolvedValue(JSON.stringify([]))

    const req = makeRequest({ question: 'Why did this run fail?', runId: RUN_UUID })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { diagnosis?: typeof VALID_DIAGNOSIS; answer: string }
    expect(body.diagnosis).toEqual(VALID_DIAGNOSIS)
    expect(body.answer).toBe(VALID_DIAGNOSIS.summary)
  })

  it('returns 500 with a clear error if callLLMStructured cannot produce a valid diagnosis', async () => {
    mockGetRunDetails.mockResolvedValue(JSON.stringify({ runId: RUN_UUID, status: 'completed', failedStep: null }))
    mockCallLLMStructured.mockRejectedValue(new Error('Structured output failed schema validation twice.'))

    const req = makeRequest({ question: 'What happened?', runId: RUN_UUID })
    const res = await POST(req)

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('validation')
  })

  it('propagates a get_run_details failure as a 500 instead of diagnosing blind', async () => {
    mockGetRunDetails.mockRejectedValue(new Error('No run found with id "aaaabbbb-cccc-dddd-eeee-ffffffffffff".'))

    const req = makeRequest({ question: 'What happened?', runId: RUN_UUID })
    const res = await POST(req)

    expect(res.status).toBe(500)
    // Must not have proceeded to synthesize a diagnosis without real data.
    expect(mockCallLLMStructured).not.toHaveBeenCalled()
  })

  it('writes tools_called and the diagnosis summary to agent_decisions', async () => {
    mockGetRunDetails.mockResolvedValue(
      JSON.stringify({ runId: RUN_UUID, status: 'failed', failedStep: { nodeId: 'n1', nodeLabel: 'Score Check' } })
    )
    mockGetGuardrailEvents.mockResolvedValue(JSON.stringify([]))
    const supabaseMock = makeSupabaseMock()
    mockCreateServerClient.mockReturnValue(supabaseMock)

    const req = makeRequest({ question: 'Why did this run fail?', runId: RUN_UUID })
    await POST(req)
    await new Promise((resolve) => setTimeout(resolve, 10))

    const insertMock = (supabaseMock.from as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
      insert: ReturnType<typeof vi.fn>
    }
    expect(insertMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_called: 'get_run_details + get_guardrail_events',
        final_answer: VALID_DIAGNOSIS.summary,
      })
    )
  })
})
