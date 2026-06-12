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
      <div className="mx-1 my-2 rounded border border-green-800 bg-green-950 px-4 py-3 text-sm text-green-300">
        Decision submitted — workflow continuing…
      </div>
    )
  }

  const busy = cardStatus === 'submitting'

  return (
    <div className="mx-1 my-2 rounded border border-blue-800 bg-gray-900 p-4">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base leading-none text-blue-400">⏸</span>
        <span className="text-sm font-semibold text-blue-300">{pause.label}</span>
      </div>

      {/* Review message */}
      <p className="mb-3 text-xs text-gray-400">{pause.message}</p>

      {/* Editable output */}
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Content to review / edit
      </label>
      <textarea
        value={editedOutput}
        onChange={(e) => setEditedOutput(e.target.value)}
        disabled={busy}
        rows={6}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs text-gray-200 focus:border-gray-500 focus:outline-none disabled:opacity-50"
      />

      {/* Error */}
      {cardStatus === 'error' && (
        <p className="mb-2 text-xs text-red-400">{errorMsg}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit('approve', false)}
          className="rounded bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy || editedOutput === pause.previousOutput}
          onClick={() => void submit('approve', true)}
          className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          title="Approve with your edits"
        >
          Edit + Continue
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit('reject', false)}
          className="ml-auto rounded bg-red-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {busy && (
        <p className="mt-2 text-[11px] text-gray-500">Submitting decision…</p>
      )}
    </div>
  )
}
