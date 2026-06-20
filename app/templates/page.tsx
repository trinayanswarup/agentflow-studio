'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { TEMPLATES } from '@/lib/templates'
import type { SearchResult } from '@/app/api/rag/search/route'

const CATEGORY_COLOR: Record<string, string> = {
  Starter:  'bg-blue-500/10 text-blue-300 ring-1 ring-inset ring-blue-500/20',
  Sales:    'bg-purple-500/10 text-purple-300 ring-1 ring-inset ring-purple-500/20',
  Security: 'bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/20',
  Research: 'bg-green-500/10 text-green-300 ring-1 ring-inset ring-green-500/20',
}

export default function TemplatesPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
      setResults(null)
      setSearching(false)
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(() => {
      void fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })
        .then((r) => r.json())
        .then((data: { results?: SearchResult[] }) => {
          setResults(data.results ?? [])
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#1c1c1c] text-gray-100">
      <div className="mx-auto max-w-5xl px-6 py-16">
        {/* Header */}
        <Link href="/" className="text-sm text-gray-500 transition-colors hover:text-gray-300">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">Templates</h1>
        <p className="mt-2 max-w-xl text-gray-400">
          Pre-built workflows ready to run. Load one into the editor and run it in seconds.
        </p>

        {/* Search bar */}
        <div className="mt-6 flex items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows by description…"
            className="w-full max-w-lg rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-accent-500 focus:outline-none"
          />
          {searching && (
            <span className="text-xs text-gray-500">Searching…</span>
          )}
        </div>

        {/* Search results */}
        {query.trim() && results !== null ? (
          <div className="mt-8">
            {results.length === 0 ? (
              <p className="text-sm text-gray-500">No workflows found matching &ldquo;{query}&rdquo;.</p>
            ) : (
              <>
                <p className="mb-4 text-xs text-gray-500 uppercase tracking-wider font-semibold">
                  {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {results.map((r) => (
                    <div
                      key={r.workflowId}
                      className="group flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-lg font-semibold text-white">{r.name}</h2>
                        <span className="flex-shrink-0 rounded-full bg-accent-600/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent-400 ring-1 ring-inset ring-accent-600/20">
                          {(r.score * 100).toFixed(1)}% match
                        </span>
                      </div>
                      <p className="flex-1 text-xs leading-relaxed text-gray-500 line-clamp-2">
                        {r.content.split('\n').slice(1).join(' · ')}
                      </p>
                      <div className="flex items-center justify-end border-t border-gray-800 pt-3">
                        <a
                          href={`/editor?workflow=${r.workflowId}`}
                          className="rounded-lg bg-gray-200 px-4 py-1.5 text-sm font-medium text-black transition-colors hover:bg-gray-300"
                        >
                          Use this workflow →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Default template grid */
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <div
                key={t.id}
                className="group flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-white">{t.name}</h2>
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      CATEGORY_COLOR[t.category] ?? 'bg-gray-800 text-gray-300'
                    }`}
                  >
                    {t.category}
                  </span>
                </div>

                <p className="flex-1 text-sm leading-relaxed text-gray-400">{t.description}</p>

                <div className="flex items-center justify-between border-t border-gray-800 pt-3">
                  <span className="font-mono text-[11px] tabular-nums text-gray-500">
                    {t.definition.nodes.length} nodes · {t.definition.edges.length} edges
                  </span>
                  <Link
                    href={`/editor?template=${t.id}`}
                    className="rounded-lg bg-gray-200 px-4 py-1.5 text-sm font-medium text-black transition-colors hover:bg-gray-300"
                  >
                    Use this template →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer nav */}
        <nav className="mt-12 flex gap-6 border-t border-gray-800 pt-8 text-sm text-gray-500">
          <Link href="/how-it-works" className="hover:text-gray-300">How it works</Link>
          <Link href="/editor" className="hover:text-gray-300">Blank editor</Link>
          <Link href="/eval" className="hover:text-gray-300">Eval Runner</Link>
        </nav>
      </div>
    </div>
  )
}
