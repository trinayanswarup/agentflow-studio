'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Placement = 'right' | 'bottom' | 'center'

interface TourStep {
  target: string   // data-tour attribute; '' = info-only centered card
  title: string
  body: string
  placement: Placement
}

const STEPS: TourStep[] = [
  {
    target: 'sidebar',
    title: 'Drag from here',
    body: 'Each card is a node type. Drag one onto the canvas to add a step to your workflow.',
    placement: 'right',
  },
  {
    target: 'canvas',
    // Canvas fills the full viewport height — 'center' floats the card inside
    // the spotlight rather than positioning it off-screen below the target.
    title: 'Click to configure',
    body: 'Click any node to open its config panel on the right. Set prompts, tool names, and condition expressions.',
    placement: 'center',
  },
  {
    target: 'save-btn',
    title: 'Run it',
    body: 'Save your workflow here. AgentFlow opens the run page where you enter an input and execute the graph.',
    placement: 'bottom',
  },
  {
    target: '',
    title: 'Watch each step',
    body: 'The trace panel on the run page streams every node in real time — latency, tokens, and output as execution moves through the graph.',
    placement: 'center',
  },
]

const PAD = 8
const CARD_W = 280

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function measureTarget(target: string): Rect | null {
  if (!target) return null
  const el = document.querySelector(`[data-tour="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function cardPosition(
  placement: Placement,
  rect: Rect | null
): React.CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (!rect) {
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: CARD_W }
  }

  if (placement === 'center') {
    return {
      position: 'fixed',
      top: Math.max(8, Math.min(rect.top + rect.height / 2 - 80, vh - 220)),
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - CARD_W / 2, vw - CARD_W - 8)),
      width: CARD_W,
    }
  }

  if (placement === 'right') {
    return {
      position: 'fixed',
      top: Math.max(8, Math.min(rect.top - PAD, vh - 220)),
      left: Math.min(rect.left + rect.width + PAD + 12, vw - CARD_W - 8),
      width: CARD_W,
    }
  }

  // bottom — flip above the target if the card would overflow the viewport
  const belowTop = rect.top + rect.height + PAD + 12
  return {
    position: 'fixed',
    top: belowTop + 180 > vh ? Math.max(8, rect.top - 180 - PAD - 12) : belowTop,
    left: Math.max(8, Math.min(rect.left, vw - CARD_W - 8)),
    width: CARD_W,
  }
}

interface Props {
  onClose: () => void
}

export function GuidedTour({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const current = STEPS[step]!
  const isLast = step === STEPS.length - 1
  const hasSpotlight = !!current.target && rect !== null

  useEffect(() => {
    function measure() {
      setRect(measureTarget(current.target))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [current.target])

  function advance() {
    if (isLast) { onClose(); return }
    setStep((s) => s + 1)
  }

  const cStyle = cardPosition(current.placement, rect)

  return (
    // Full-screen overlay always present — blocks all clicks to the underlying
    // page so the user can only interact with the tour card's buttons.
    <div className="fixed inset-0 z-50 bg-black/[0.72] pointer-events-auto">
      {/* Spotlight — indigo outline marks the target; position/size are runtime values */}
      {hasSpotlight && (
        <div
          className="fixed rounded-[10px] pointer-events-none outline outline-2 outline-indigo-500/65"
          style={{
            top: rect!.top - PAD,
            left: rect!.left - PAD,
            width: rect!.width + PAD * 2,
            height: rect!.height + PAD * 2,
            transition: 'top 0.22s ease, left 0.22s ease, width 0.22s ease, height 0.22s ease',
          }}
        />
      )}

      {/* Tour card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          style={cStyle}
          className="z-[52] rounded-xl border border-gray-700/80 bg-gray-900 p-4 shadow-2xl shadow-black/60"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Step progress bar */}
          <div className="mb-3 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-[3px] flex-1 rounded-full transition-colors duration-200 ${
                  i === step ? 'bg-accent-500' : i < step ? 'bg-gray-600' : 'bg-gray-800'
                }`}
              />
            ))}
          </div>

          <p className="mb-1.5 text-sm font-semibold text-white">{current.title}</p>
          <p className="mb-4 text-[13px] leading-relaxed text-gray-400">{current.body}</p>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-600 transition-colors hover:text-gray-400"
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={advance}
              className="rounded-lg bg-accent-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-500"
            >
              {isLast ? 'Done' : 'Next →'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
