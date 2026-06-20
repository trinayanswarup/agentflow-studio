'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DocRecord } from '@/app/api/documents/route'
import type { AskResponse, Source } from '@/app/api/documents/ask/route'
import type { WorkflowDefinition } from '@/lib/types'

interface Message {
  id: string
  question: string
  answer: string
  sources: Source[]
  sourcesOpen: boolean
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const secs = Math.floor(diffMs / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function FiletypeBadge({ type }: { type: string }) {
  const cls =
    type === 'pdf'
      ? 'bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20'
      : 'bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20'
  return (
    <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {type}
    </span>
  )
}

export default function DocumentsPage() {
  const router = useRouter()
  const [docs, setDocs] = useState<DocRecord[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<DocRecord | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle')
  const [importError, setImportError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  // Reset chat when selected doc changes
  useEffect(() => {
    setMessages([])
    setQuestion('')
  }, [selectedDoc?.id])

  // Scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, asking])

  useEffect(() => {
    void loadDocs()
  }, [])

  async function loadDocs() {
    setLoadingDocs(true)
    try {
      const res = await fetch('/api/documents')
      const data = (await res.json()) as { documents: DocRecord[] }
      setDocs(data.documents ?? [])
    } catch {
      /* show empty list */
    } finally {
      setLoadingDocs(false)
    }
  }

  async function handleFile(file: File) {
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) {
      setUploadStatus('error')
      setUploadError('Only PDF and DOCX files are accepted.')
      return
    }

    setUploadStatus('uploading')
    setUploadError(null)

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
      const data = (await res.json()) as { docId?: string; filename?: string; chunkCount?: number; error?: string }
      if (!res.ok || !data.docId) throw new Error(data.error ?? 'Upload failed')

      const newDoc: DocRecord = {
        id: data.docId,
        filename: data.filename ?? file.name,
        filetype: lower.endsWith('.pdf') ? 'pdf' : 'docx',
        uploaded_at: new Date().toISOString(),
        chunkCount: data.chunkCount ?? 0,
      }
      setDocs((prev) => [newDoc, ...prev])
      setUploadStatus('done')
      setTimeout(() => setUploadStatus('idle'), 3000)
    } catch (err) {
      setUploadStatus('error')
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = ''
  }

  async function handleImportFile(file: File) {
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) {
      setImportStatus('error')
      setImportError('Only PDF and DOCX files are accepted.')
      return
    }
    setImportStatus('importing')
    setImportError(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/documents/import-workflow', { method: 'POST', body: fd })
      const data = (await res.json()) as { definition?: WorkflowDefinition; nodeCount?: number; error?: string }
      if (!res.ok || !data.definition) throw new Error(data.error ?? 'Import failed')
      sessionStorage.setItem('importedWorkflow', JSON.stringify(data.definition))
      setImportStatus('done')
      router.push('/editor')
    } catch (err) {
      setImportStatus('error')
      setImportError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  function onImportFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleImportFile(file)
    e.target.value = ''
  }

  async function handleAsk() {
    if (!selectedDoc || !question.trim() || asking) return
    const q = question.trim()
    setQuestion('')
    setAsking(true)
    try {
      const res = await fetch('/api/documents/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: selectedDoc.id, question: q }),
      })
      const data = (await res.json()) as AskResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Ask failed')
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), question: q, answer: data.answer, sources: data.sources, sourcesOpen: false },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          question: q,
          answer: `Error: ${err instanceof Error ? err.message : 'Failed to get answer'}`,
          sources: [],
          sourcesOpen: false,
        },
      ])
    } finally {
      setAsking(false)
      setTimeout(() => chatInputRef.current?.focus(), 50)
    }
  }

  function toggleSources(id: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, sourcesOpen: !m.sourcesOpen } : m)))
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] bg-gray-950 text-gray-100">
      {/* ── LEFT PANEL (30%) ── */}
      <div className="flex w-80 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-900/30">

        {/* Upload area */}
        <div className="p-4">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragOver
                ? 'border-accent-500 bg-accent-500/5'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <svg className="h-7 w-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-xs text-gray-500">Drop a PDF or DOCX here</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadStatus === 'uploading'}
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
            >
              Browse files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              title="Upload PDF or DOCX for Q&A"
              className="hidden"
              onChange={onFileInputChange}
            />
          </div>

          {uploadStatus === 'uploading' && (
            <p className="mt-2 text-center text-xs text-yellow-400">Uploading and embedding… this may take a moment</p>
          )}
          {uploadStatus === 'done' && (
            <p className="mt-2 text-center text-xs text-green-400">✓ Upload complete</p>
          )}
          {uploadStatus === 'error' && (
            <p className="mt-2 text-center text-xs text-red-400">{uploadError}</p>
          )}
        </div>

        {/* Import as Workflow section */}
        <div className="border-t border-gray-800 p-4">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
            Import as Workflow
          </p>
          <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
            Upload a process doc and Groq will auto-generate a workflow on the canvas.
          </p>
          <button
            type="button"
            onClick={() => importFileInputRef.current?.click()}
            disabled={importStatus === 'importing'}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {importStatus === 'importing' ? 'Extracting workflow…' : 'Upload PDF / DOCX →'}
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".pdf,.docx"
            title="Upload PDF or DOCX to import as workflow"
            className="hidden"
            onChange={onImportFileInputChange}
          />
          {importStatus === 'error' && (
            <p className="mt-2 text-[11px] text-red-400">{importError}</p>
          )}
        </div>

        {/* Doc list */}
        <div className="scroll-slim flex-1 overflow-y-auto border-t border-gray-800">
          <div className="px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              {docs.length} document{docs.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loadingDocs ? (
            <div className="space-y-2 px-4 pb-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-800/50" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-gray-600">No documents yet. Upload one to get started.</p>
          ) : (
            docs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setSelectedDoc(doc)}
                className={`w-full border-b border-gray-800/60 p-4 text-left transition-colors hover:bg-gray-800/40 ${
                  selectedDoc?.id === doc.id ? 'bg-gray-800/60 ring-l-2 ring-accent-500' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <FiletypeBadge type={doc.filetype} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-gray-200">{doc.filename}</p>
                    <p className="mt-0.5 text-[10px] text-gray-500">
                      {doc.chunkCount} chunks · {timeAgo(doc.uploaded_at)}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL (70%) ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selectedDoc ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-800 text-2xl text-gray-600">
              📄
            </div>
            <p className="text-sm text-gray-500">Select a document to start asking questions</p>
            <p className="max-w-xs text-xs text-gray-600">
              Upload a PDF or DOCX on the left, then click it to open the Q&amp;A chat.
            </p>
          </div>
        ) : (
          <>
            {/* Doc header bar */}
            <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-gray-800 px-6">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-200">{selectedDoc.filename}</p>
              </div>
              <span className="text-[11px] text-gray-500">{selectedDoc.chunkCount} chunks indexed</span>
              <FiletypeBadge type={selectedDoc.filetype} />
            </div>

            {/* Messages */}
            <div className="scroll-slim flex-1 overflow-y-auto px-6 py-4">
              {messages.length === 0 && !asking && (
                <div className="mt-16 flex flex-col items-center gap-2 text-center">
                  <p className="text-sm text-gray-500">Ask a question about this document.</p>
                  <p className="text-xs text-gray-600">The answer will cite the relevant excerpts.</p>
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
                  <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-gray-800 bg-gray-900 px-4 py-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{msg.answer}</p>

                    {msg.sources.length > 0 && (
                      <div className="mt-3 border-t border-gray-800 pt-3">
                        <button
                          type="button"
                          onClick={() => toggleSources(msg.id)}
                          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-300"
                        >
                          <span>{msg.sourcesOpen ? '▾' : '▸'}</span>
                          {msg.sources.length} source{msg.sources.length !== 1 ? 's' : ''}
                        </button>

                        {msg.sourcesOpen && (
                          <div className="mt-2 flex flex-col gap-2">
                            {msg.sources.map((src, i) => (
                              <div
                                key={src.chunkIndex}
                                className="rounded-lg border border-gray-700 bg-gray-800/40 p-3"
                              >
                                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                  [{i + 1}] chunk {src.chunkIndex}
                                </div>
                                <p className="line-clamp-4 text-xs leading-relaxed text-gray-400">
                                  {src.content}
                                </p>
                              </div>
                            ))}
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
                  ref={chatInputRef}
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAsk() }}
                  placeholder="Ask a question about this document…"
                  disabled={asking}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-accent-500 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void handleAsk()}
                  disabled={asking || !question.trim()}
                  className="rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Ask
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
