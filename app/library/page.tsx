'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface WorkflowSummary {
  id: string
  name: string
  created_at: string
  definition_json: {
    nodes: unknown[]
    edges: unknown[]
  } | null
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return 'just now'
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`
}

interface ShareState {
  workflowId: string
  url: string
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="h-5 w-2/3 animate-pulse rounded bg-gray-800" />
        <div className="h-4 w-16 animate-pulse rounded bg-gray-800" />
      </div>
      <div className="mb-4 h-3 w-1/4 animate-pulse rounded bg-gray-800" />
      <div className="mt-4 flex gap-2 border-t border-gray-800 pt-3">
        <div className="h-7 w-28 animate-pulse rounded-lg bg-gray-800" />
        <div className="h-7 w-14 animate-pulse rounded-lg bg-gray-800" />
        <div className="h-7 w-14 animate-pulse rounded-lg bg-gray-800" />
      </div>
    </div>
  )
}

export default function LibraryPage() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [shareState, setShareState] = useState<ShareState | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/workflows')
      .then((r) => r.json())
      .then((data: { workflows?: WorkflowSummary[] }) => {
        setWorkflows(data.workflows ?? [])
      })
      .catch(() => {/* show empty state */})
      .finally(() => setLoading(false))
  }, [])

  async function handleShare(id: string) {
    if (sharingId) return
    // If we already have a share URL for this workflow, just show it again
    if (shareState?.workflowId === id) {
      return
    }
    setSharingId(id)
    try {
      const res = await fetch(`/api/workflows/${id}/share`, { method: 'POST' })
      if (!res.ok) throw new Error('Share failed')
      const { url } = (await res.json()) as { url: string }
      setShareState({ workflowId: id, url })
      setCopied(false)
    } catch {
      // silently fail — button re-enables
    } finally {
      setSharingId(null)
    }
  }

  function handleCopy() {
    if (!shareState) return
    void navigator.clipboard.writeText(shareState.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function dismissShare() {
    setShareState(null)
    setCopied(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#1c1c1c] text-gray-100">
      <div className="mx-auto max-w-5xl px-6 py-16">
        {/* Header */}
        <Link href="/" className="text-sm text-gray-500 transition-colors hover:text-gray-300">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">Workflow Library</h1>
        <p className="mt-2 max-w-xl text-gray-400">
          All your saved workflows. Open in the editor, run, or share with a link.
        </p>

        {/* Grid */}
        {loading ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : workflows.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-4 text-center">
            <p className="text-gray-400">No saved workflows yet.</p>
            <p className="text-sm text-gray-500">
              Go to{' '}
              <Link href="/templates" className="text-gray-300 underline underline-offset-2 hover:text-white">
                Templates
              </Link>{' '}
              to start one.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {workflows.map((wf) => {
              const nodeCount = wf.definition_json?.nodes?.length ?? 0
              const edgeCount = wf.definition_json?.edges?.length ?? 0
              const isThisShared = shareState?.workflowId === wf.id

              return (
                <div
                  key={wf.id}
                  className="group flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-white">{wf.name}</h2>
                    <span className="flex-shrink-0 text-[11px] tabular-nums text-gray-500">
                      {timeAgo(wf.created_at)}
                    </span>
                  </div>

                  <span className="font-mono text-[11px] tabular-nums text-gray-500">
                    {nodeCount} nodes · {edgeCount} edges
                  </span>

                  <div className="flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
                    <Link
                      href={`/editor?workflow=${wf.id}`}
                      className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700"
                    >
                      Open in Editor
                    </Link>
                    <Link
                      href={`/run/${wf.id}`}
                      className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-gray-300"
                    >
                      Run
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleShare(wf.id)}
                      disabled={sharingId === wf.id}
                      className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
                    >
                      {sharingId === wf.id ? 'Sharing…' : 'Share'}
                    </button>
                  </div>

                  {/* Inline share popover */}
                  {isThisShared && (
                    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
                      <p className="mb-1.5 text-[11px] text-gray-400">Shareable link:</p>
                      <p className="mb-2 truncate font-mono text-[11px] text-gray-300">
                        {shareState.url}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="rounded-lg bg-accent-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-500"
                        >
                          {copied ? '✓ Copied!' : 'Copy link'}
                        </button>
                        <button
                          type="button"
                          onClick={dismissShare}
                          className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-700"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer nav */}
        <nav className="mt-12 flex gap-6 border-t border-gray-800 pt-8 text-sm text-gray-500">
          <Link href="/templates" className="hover:text-gray-300">Templates</Link>
          <Link href="/how-it-works" className="hover:text-gray-300">How it works</Link>
          <Link href="/editor" className="hover:text-gray-300">Blank editor</Link>
          <Link href="/eval" className="hover:text-gray-300">Eval Runner</Link>
        </nav>
      </div>
    </div>
  )
}
