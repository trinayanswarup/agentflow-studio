'use client'

import { useState } from 'react'

export interface PendingPause {
  nodeId: string
  label: string
  message: string
  previousOutput: string
}

interface Props {
  runId: string
  pause: PendingPause
  onDecision: () => void
}

type CardStatus = 'idle' | 'submitting' | 'done' | 'error'

export function HumanApprovalCard({ runId, pause, onDecision }: Props) {
  const [editedOutput, setEditedOutput] = useState(pause.previousOutput)
  const [cardStatus, setCardStatus] = useState<CardStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function submit(action: 'approve' | 'reject', useEdited: boolean) {
    setCardStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/run/${runId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(useEdited && editedOutput !== pause.previousOutput
            ? { editedOutput }
            : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setCardStatus('done')
      // Give the user a moment to see the confirmation, then clear.
      setTimeout(onDecision, 800)
    } catch (err) {
      setCardStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  if (cardStatus === 'done') {
    return (
      <div className="my-3 flex items-center gap-2 rounded-lg border border-green-800/60 bg-green-950/40 px-4 py-3 text-sm text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Decision submitted — workflow continuing…
      </div>
    )
  }

  const busy = cardStatus === 'submitting'
  const hasEdits = editedOutput !== pause.previousOutput

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-accent-700/60 bg-gray-900 shadow-accent-glow animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-800 bg-accent-500/10 px-4 py-2.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent-500" />
        <span className="text-sm font-semibold text-accent-200">{pause.label}</span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-accent-400">
          Needs your review
        </span>
      </div>

      <div className="p-4">
        {/* Review message */}
        <p className="mb-3 text-xs leading-relaxed text-gray-400">{pause.message}</p>

        {/* Editable output */}
        <label
          htmlFor="approval-content"
          className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500"
        >
          Content to review / edit
        </label>
        <textarea
          id="approval-content"
          value={editedOutput}
          onChange={(e) => setEditedOutput(e.target.value)}
          disabled={busy}
          rows={6}
          className="scroll-slim mb-3 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-xs leading-relaxed text-gray-200 transition-colors focus:border-accent-500 focus:outline-none disabled:opacity-50"
        />

        {/* Error */}
        {cardStatus === 'error' && (
          <p className="mb-2 text-xs text-red-400">{errorMsg}</p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit('approve', false)}
            className="rounded-lg bg-green-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
            title="Approve and continue with the original content"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy || !hasEdits}
            onClick={() => void submit('approve', true)}
            className="rounded-lg border border-accent-600 px-3.5 py-1.5 text-xs font-semibold text-accent-300 transition-colors hover:bg-accent-950/60 disabled:cursor-not-allowed disabled:opacity-40"
            title={hasEdits ? 'Approve and continue with your edited content' : 'Edit the content above to enable this'}
          >
            Edit + Continue
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit('reject', false)}
            className="ml-auto rounded-lg border border-red-800/70 px-3.5 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-950/60 disabled:opacity-50"
          >
            Reject
          </button>
        </div>

        {busy && <p className="mt-2 text-[11px] text-gray-500">Submitting decision…</p>}
      </div>
    </div>
  )
}
