'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Header() {
  const pathname = usePathname()

  // Landing, run, editor, documents, and share all have their own full-screen layouts.
  if (
    pathname === '/' ||
    pathname.startsWith('/run') ||
    pathname.startsWith('/editor') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/share')
  ) return null

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-gray-800 bg-gray-950/80 px-6 backdrop-blur-sm">
      <Link
        href="/"
        className="text-sm font-semibold tracking-tight text-gray-100 transition-colors hover:text-white"
      >
        AgentFlow Studio
      </Link>
      <nav className="flex items-center gap-6 text-sm text-gray-400">
        <Link href="/templates" className="transition-colors hover:text-gray-100">
          Templates
        </Link>
        <Link href="/library" className="transition-colors hover:text-gray-100">
          Library
        </Link>
        <Link href="/analytics" className="transition-colors hover:text-gray-100">
          Insights
        </Link>
        <Link href="/documents" className="transition-colors hover:text-gray-100">
          Documents
        </Link>
        <Link href="/agent" className="transition-colors hover:text-gray-100">
          Ask Agent
        </Link>
        <Link href="/how-it-works" className="transition-colors hover:text-gray-100">
          How it works
        </Link>
        <Link href="/eval" className="transition-colors hover:text-gray-100">
          Eval Runner
        </Link>
      </nav>
    </header>
  )
}
