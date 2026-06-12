'use client'

import { useEffect, useState } from 'react'
import type { NodeType } from '@/lib/types'
import type { AgentNode } from './types'
import { NODE_COLORS, NODE_LABELS } from './types'

const AVAILABLE_TOOLS = ['web_search', 'web_fetch', 'extract_json', 'send_webhook', 'evaluate_output']

interface Props {
  node: AgentNode | null
  onUpdate: (nodeId: string, label: string, config: Record<string, unknown>) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:outline-none'

export function NodeConfigPanel({ node, onUpdate }: Props) {
  const [label, setLabel] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})

  // Sync form state when the selected node changes. We intentionally depend only
  // on node.id — we don't want to reset the form on every canvas re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!node) return
    setLabel(node.data.label)
    setConfig(node.data.config)
  }, [node?.id])

  if (!node) {
    return (
      <aside className="flex w-72 flex-shrink-0 flex-col items-center justify-center border-l border-gray-800 bg-gray-950 p-4">
        <p className="text-center text-sm text-gray-500">Click a node to configure it.</p>
      </aside>
    )
  }

  const type = node.type as NodeType
  const color = NODE_COLORS[type]

  function push(newLabel: string, newConfig: Record<string, unknown>) {
    setLabel(newLabel)
    setConfig(newConfig)
    onUpdate(node!.id, newLabel, newConfig)
  }

  function setField(key: string, value: unknown) {
    const next = { ...config, [key]: value }
    push(label, next)
  }

  function setLabelField(v: string) {
    push(v, config)
  }

  const c = config

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col gap-4 overflow-y-auto border-l border-gray-800 bg-gray-950 p-4">
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
          {NODE_LABELS[type]}
        </div>
        <Field label="Label">
          <input
            className={inputCls}
            value={label}
            onChange={(e) => setLabelField(e.target.value)}
          />
        </Field>
      </div>

      {type === 'input' && (
        <Field label="Placeholder hint">
          <input
            className={inputCls}
            placeholder="e.g. Company name"
            value={(c.placeholder as string) ?? ''}
            onChange={(e) => setField('placeholder', e.target.value)}
          />
        </Field>
      )}

      {type === 'llm_call' && (
        <>
          <Field label="System prompt">
            <textarea
              className={`${inputCls} min-h-[70px] resize-y`}
              placeholder="Optional system instructions"
              value={(c.system as string) ?? ''}
              onChange={(e) => setField('system', e.target.value)}
            />
          </Field>
          <Field label="Prompt">
            <textarea
              className={`${inputCls} min-h-[100px] resize-y`}
              placeholder="Use {{nodeId_output}} for context"
              value={(c.prompt as string) ?? ''}
              onChange={(e) => setField('prompt', e.target.value)}
            />
          </Field>
          <Field label="Tools (select all that apply)">
            <div className="flex flex-col gap-1">
              {AVAILABLE_TOOLS.map((tool) => {
                const active = ((c.tools as string[]) ?? []).includes(tool)
                return (
                  <label key={tool} className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => {
                        const current = (c.tools as string[]) ?? []
                        const next = e.target.checked
                          ? [...current, tool]
                          : current.filter((t) => t !== tool)
                        setField('tools', next)
                      }}
                      className="accent-purple-500"
                    />
                    {tool}
                  </label>
                )
              })}
            </div>
          </Field>
        </>
      )}

      {type === 'tool_call' && (
        <>
          <Field label="Tool">
            <select
              className={inputCls}
              value={(c.toolName as string) ?? 'web_search'}
              onChange={(e) => setField('toolName', e.target.value)}
            >
              {AVAILABLE_TOOLS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Arguments (JSON)">
            <textarea
              className={`${inputCls} min-h-[100px] resize-y font-mono text-xs`}
              placeholder={'{\n  "query": "{{input_output}}"\n}'}
              value={
                typeof c.args === 'string'
                  ? c.args
                  : JSON.stringify(c.args ?? {}, null, 2)
              }
              onChange={(e) => {
                try {
                  setField('args', JSON.parse(e.target.value))
                } catch {
                  setField('args', e.target.value)
                }
              }}
            />
          </Field>
        </>
      )}

      {type === 'condition' && (
        <Field label="Expression">
          <input
            className={inputCls}
            placeholder="e.g. {{score_output}} >= 7"
            value={(c.expression as string) ?? ''}
            onChange={(e) => setField('expression', e.target.value)}
          />
          <p className="text-[10px] text-gray-500">
            Operators: contains, not_contains, ==, !=, &gt;=, &lt;=, &gt;, &lt;
          </p>
        </Field>
      )}

      {type === 'human_pause' && (
        <Field label="Review message">
          <textarea
            className={`${inputCls} min-h-[70px] resize-y`}
            placeholder="Message shown to the reviewer"
            value={(c.message as string) ?? ''}
            onChange={(e) => setField('message', e.target.value)}
          />
        </Field>
      )}

      {type === 'output' && (
        <Field label="Output template">
          <textarea
            className={`${inputCls} min-h-[100px] resize-y`}
            placeholder="{{email_output}}\n\n---\n{{profile_output}}"
            value={(c.template as string) ?? ''}
            onChange={(e) => setField('template', e.target.value)}
          />
          <p className="text-[10px] text-gray-500">
            Leave empty to pass through the previous node&apos;s output.
          </p>
        </Field>
      )}
    </aside>
  )
}
