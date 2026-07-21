'use client'

import { useEffect, useRef, useState } from 'react'
import type { AskAgentResponse } from '@/app/api/agent/ask/route'

interface Message {
  id: string
  question: string
  answer: string
  toolCalled: string | null
  toolInput: Record<string, unknown> | null
  latencyMs: number
  tokensUsed: number
  traceOpen: boolean
  isError?: boolean
}

// No hardcoded workflow UUIDs here — query_workflow_logs requires a real
// workflowId and there's no tool that resolves "most recent" to one, so
// every suggestion has to be answerable without a specific ID.
const EXAMPLES = [
  'Do you have a workflow for lead qualification?',
  "What's the difference between the CyberOps and Research Agent templates?",
  'What node types are supported?',
]

function Metric({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-gray-800/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-gray-400">
      {children}
    </span>
  )
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, asking])

  async function ask(q: string) {
    const trimmed = q.trim()
    if (!trimmed || asking) return
    setQuestion('')
    setAsking(true)
    try {
      const res = await fetch('/api/agent/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      })
      const data = (await res.json()) as AskAgentResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          question: trimmed,
          answer: data.answer,
          toolCalled: data.toolCalled,
          toolInput: data.toolInput,
          latencyMs: data.latencyMs,
          tokensUsed: data.tokensUsed,
          traceOpen: false,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          question: trimmed,
          answer: `Error: ${err instanceof Error ? err.message : 'Failed to get an answer'}`,
          toolCalled: null,
          toolInput: null,
          latencyMs: 0,
          tokensUsed: 0,
          traceOpen: false,
          isError: true,
        },
      ])
    } finally {
      setAsking(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function toggleTrace(id: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, traceOpen: !m.traceOpen } : m)))
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-gray-950 text-gray-100">
      {/* Page heading */}
      <div className="flex-shrink-0 border-b border-gray-800 px-6 py-4">
        <h1 className="text-sm font-semibold text-gray-100">Ask Agent</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          Ask a question — the agent decides whether to search your workflows or pull execution
          logs, no fixed script.
        </p>
      </div>

      {/* Messages */}
      <div className="scroll-slim flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && !asking && (
          <div className="mt-16 flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-800 text-2xl text-gray-600">
              🤖
            </div>
            <div>
              <p className="text-sm text-gray-500">Ask about your workflows or their run history.</p>
              <p className="text-xs text-gray-600">Try one of these, or type your own question below.</p>
            </div>
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void ask(q)}
                  className="rounded-full border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-accent-500 hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="mb-6">
            {/* Question bubble */}
            <div className="mb-3 flex justify-end">
              <div className="max-w-[70%] rounded-xl rounded-tr-sm bg-accent-600/20 px-4 py-2.5 ring-1 ring-inset ring-accent-500/20">
                <p className="text-sm text-gray-100">{msg.question}</p>
              </div>
            </div>

            {/* Answer bubble */}
            <div
              className={`max-w-[85%] rounded-xl rounded-tl-sm border px-4 py-3 ${
                msg.isError ? 'border-red-900/60 bg-red-950/30' : 'border-gray-800 bg-gray-900'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{msg.answer}</p>

              {!msg.isError && (
                <div className="mt-3 border-t border-gray-800 pt-3">
                  <button
                    type="button"
                    onClick={() => toggleTrace(msg.id)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-300"
                  >
                    <span>{msg.traceOpen ? '▾' : '▸'}</span>
                    How I got this
                  </button>

                  {msg.traceOpen && (
                    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-gray-700 bg-gray-800/40 p-3">
                      <p className="text-xs text-gray-300">
                        {msg.toolCalled ? (
                          <>
                            Tool used:{' '}
                            <span className="font-mono text-accent-300">{msg.toolCalled}</span>
                          </>
                        ) : (
                          'Answered directly — no tool needed.'
                        )}
                      </p>

                      {msg.toolInput && Object.keys(msg.toolInput).length > 0 && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            Input
                          </span>
                          {Object.entries(msg.toolInput).map(([key, value]) => (
                            <div key={key} className="font-mono text-[11px] leading-relaxed text-gray-400">
                              <span className="text-gray-500">{key}:</span>{' '}
                              <span className="text-gray-300">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-1.5 pt-1">
                        <Metric>{msg.latencyMs}ms</Metric>
                        <Metric>{msg.tokensUsed} tok</Metric>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {asking && (
          <div className="mb-4 max-w-[85%] rounded-xl rounded-tl-sm border border-gray-800 bg-gray-900 px-4 py-3">
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-500" />
              Thinking…
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat input */}
      <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/40 p-4">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask(question)
            }}
            placeholder="Ask about a workflow or its run history…"
            disabled={asking}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-accent-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void ask(question)}
            disabled={asking || !question.trim()}
            className="rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  )
}
