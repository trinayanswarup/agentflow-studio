import Link from 'next/link'
import { TEMPLATES } from '@/lib/templates'

const CATEGORY_COLOR: Record<string, string> = {
  Starter:  'bg-blue-900 text-blue-200',
  Sales:    'bg-purple-900 text-purple-200',
  Security: 'bg-red-900 text-red-200',
  Research: 'bg-green-900 text-green-200',
}

export default function TemplatesPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-16">
        {/* Header */}
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Templates</h1>
        <p className="mb-10 text-gray-400">
          Pre-built workflows ready to run. Load one into the editor and run it in seconds.
        </p>

        {/* Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-lg border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{t.name}</h2>
                <span
                  className={`flex-shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${
                    CATEGORY_COLOR[t.category] ?? 'bg-gray-800 text-gray-300'
                  }`}
                >
                  {t.category}
                </span>
              </div>

              <p className="flex-1 text-sm leading-relaxed text-gray-400">{t.description}</p>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-600">
                  {t.definition.nodes.length} nodes · {t.definition.edges.length} edges
                </span>
                <Link
                  href={`/editor?template=${t.id}`}
                  className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                >
                  Use this template →
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Footer nav */}
        <nav className="mt-12 flex gap-6 border-t border-gray-800 pt-8 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-300">← Home</Link>
          <Link href="/editor" className="hover:text-gray-300">Blank editor</Link>
        </nav>
      </div>
    </div>
  )
}
