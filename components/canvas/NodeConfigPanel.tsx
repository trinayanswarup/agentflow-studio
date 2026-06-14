'use client'

import { useEffect, useState } from 'react'
import type { NodeType } from '@/lib/types'
import type { AgentNode } from './types'
import { NODE_LABELS } from './types'
import { TOOL_META, TOOL_NAMES } from '@/lib/tools/tool-meta'
import { labelToSlug, buildSlugMap } from '@/lib/engine/slugs'

interface Props {
  node: AgentNode | null
  onUpdate: (nodeId: string, label: string, config: Record<string, unknown>) => void
  /** All nodes on the canvas — used to build the available-variables hint. */
  nodes?: AgentNode[]
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

/** Node types that support {{nodeId_output}} template references. */
const TEMPLATE_TYPES: NodeType[] = ['llm_call', 'tool_call', 'condition', 'human_pause', 'output']

const NODE_TYPE_COLOR_CLS: Record<NodeType, string> = {
  input:       'text-blue-400',
  llm_call:    'text-purple-400',
  tool_call:   'text-yellow-400',
  condition:   'text-orange-400',
  human_pause: 'text-teal-400',
  output:      'text-green-400',
}

const NODE_TYPE_DESCRIPTIONS: Record<NodeType, string> = {
  input:       'Entry point — receives the user\'s text input and passes it downstream.',
  llm_call:    'Calls Groq with your prompt; may invoke tools in a loop until it produces a text response.',
  tool_call:   'Runs one specific tool directly with the arguments you configure — no LLM reasoning.',
  condition:   'Evaluates an expression against context values and takes the true or false branch.',
  human_pause: 'Pauses the run and shows the current output for a human to approve, edit, or reject.',
  output:      'End of the workflow — renders the final result using a template string.',
}

// ── Tool-call argument fields ─────────────────────────────────────────────────

function ToolArgFields({
  toolName,
  args,
  onChange,
}: {
  toolName: string
  args: Record<string, string>
  onChange: (args: Record<string, string>) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const meta = TOOL_META[toolName]

  if (!meta) {
    // Unknown tool — fall back to raw JSON.
    return (
      <Field label="Arguments (JSON)">
        <textarea
          className={`${inputCls} min-h-[100px] resize-y font-mono text-xs`}
          placeholder={'{\n  "key": "{{nodeId_output}}"\n}'}
          value={JSON.stringify(args, null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value) as Record<string, string>)
            } catch {
              /* keep current value while user is typing */
            }
          }}
        />
      </Field>
    )
  }

  return (
    <>
      {/* Structured field inputs */}
      {meta.fields.map((field) => (
        <Field key={field.name} label={field.label}>
          <input
            className={inputCls}
            placeholder={field.placeholder}
            value={args[field.name] ?? ''}
            onChange={(e) =>
              onChange({ ...args, [field.name]: e.target.value })
            }
          />
          <p className="text-[10px] text-gray-500">{field.description}</p>
        </Field>
      ))}

      {/* Advanced: raw JSON toggle */}
      <button
        type="button"
        className="mt-1 text-left text-[10px] text-gray-600 hover:text-gray-400"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? '▾ hide raw JSON' : '▸ advanced: edit raw JSON'}
      </button>
      {showAdvanced && (
        <textarea
          aria-label="Arguments JSON"
          className={`${inputCls} min-h-[80px] resize-y font-mono text-[11px]`}
          value={JSON.stringify(args, null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value) as Record<string, string>)
            } catch {
              /* keep current value while user is typing */
            }
          }}
        />
      )}
    </>
  )
}

// ── Available variables panel ─────────────────────────────────────────────────

function VariablesHint({
  currentId,
  nodes,
}: {
  currentId: string
  nodes: AgentNode[]
}) {
  const [copied, setCopied] = useState<string | null>(null)

  // Dedup slugs across all nodes so the panel matches what the runner resolves.
  const slugMap = buildSlugMap(nodes.map((n) => ({ id: n.id, label: n.data.label })))

  // Output nodes don't produce intermediate values worth referencing.
  const candidates = nodes.filter(
    (n) => n.id !== currentId && n.type !== ('output' as NodeType)
  )
  if (candidates.length === 0) return null

  function copy(variable: string) {
    void navigator.clipboard.writeText(variable)
    setCopied(variable)
    setTimeout(() => setCopied(null), 1200)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Available variables
      </span>
      <div className="flex flex-col gap-px">
        {candidates.map((n) => {
          const type = n.type as NodeType
          const slug = slugMap.get(n.id) ?? labelToSlug(n.data.label)
          const variable = `{{${slug}_output}}`
          const isCopied = copied === variable
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => copy(variable)}
              className="group flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-gray-800"
              title="Click to copy"
            >
              <div className="flex items-center gap-1.5">
                <code className="flex-1 truncate font-mono text-[11px] text-blue-400">
                  {variable}
                </code>
                {isCopied && (
                  <span className="flex-shrink-0 text-[10px] text-green-400">✓</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                <span className="truncate">{n.data.label}</span>
                <span className="flex-shrink-0 text-gray-700">·</span>
                <span className={`flex-shrink-0 ${NODE_TYPE_COLOR_CLS[type] ?? 'text-gray-500'}`}>
                  {NODE_LABELS[type]}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-600">Click to copy. Both readable and UUID forms work.</p>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function NodeConfigPanel({ node, onUpdate, nodes = [] }: Props) {
  const [label, setLabel] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})

  // Sync form state whenever the selected node ID changes.
  // We intentionally depend only on node.id so that the user's in-progress
  // edits are not overwritten by re-renders that update node.data externally.
  useEffect(() => {
    if (!node) return
    setLabel(node.data.label)
    setConfig(node.data.config)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id])

  if (!node) {
    return (
      <aside className="flex w-72 flex-shrink-0 flex-col items-center justify-center border-l border-gray-800 bg-gray-950 p-4">
        <p className="text-center text-sm text-gray-500">Click a node to configure it.</p>
      </aside>
    )
  }

  const type = node.type as NodeType
  const colorCls = NODE_TYPE_COLOR_CLS[type] ?? 'text-gray-400'

  function push(newLabel: string, newConfig: Record<string, unknown>) {
    setLabel(newLabel)
    setConfig(newConfig)
    onUpdate(node!.id, newLabel, newConfig)
  }

  function setField(key: string, value: unknown) {
    push(label, { ...config, [key]: value })
  }

  const c = config
  const showVarsHint = TEMPLATE_TYPES.includes(type) && nodes.length > 1

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col gap-4 overflow-y-auto border-l border-gray-800 bg-gray-950 p-4">
      {/* Node type badge + description + label */}
      <div>
        <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${colorCls}`}>
          {NODE_LABELS[type]}
        </div>
        <p className="mb-3 text-[11px] leading-snug text-gray-400">
          {NODE_TYPE_DESCRIPTIONS[type]}
        </p>
        <Field label="Label">
          <input
            aria-label="Node label"
            placeholder="Node label"
            className={inputCls}
            value={label}
            onChange={(e) => push(e.target.value, config)}
          />
        </Field>
      </div>

      {/* ── input ── */}
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

      {/* ── llm_call ── */}
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
              placeholder="Use {{nodeId_output}} for upstream context"
              value={(c.prompt as string) ?? ''}
              onChange={(e) => setField('prompt', e.target.value)}
            />
          </Field>
          <Field label="Tools (LLM may call these)">
            <div className="flex flex-col gap-1">
              {TOOL_NAMES.map((tool) => {
                const active = ((c.tools as string[]) ?? []).includes(tool)
                return (
                  <label
                    key={tool}
                    className="flex cursor-pointer items-center gap-2 text-sm text-gray-300"
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => {
                        const current = (c.tools as string[]) ?? []
                        setField(
                          'tools',
                          e.target.checked
                            ? [...current, tool]
                            : current.filter((t) => t !== tool)
                        )
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

      {/* ── tool_call ── */}
      {type === 'tool_call' && (
        <>
          <Field label="Tool">
            <select
              id="tool-select"
              aria-label="Tool"
              className={inputCls}
              value={(c.toolName as string) ?? 'web_search'}
              onChange={(e) => {
                const newTool = e.target.value
                const meta = TOOL_META[newTool]
                const freshArgs: Record<string, string> = {}
                meta?.fields.forEach((f) => {
                  freshArgs[f.name] = ''
                })
                push(label, { ...c, toolName: newTool, args: freshArgs })
              }}
            >
              {TOOL_NAMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {TOOL_META[(c.toolName as string) ?? '']?.description && (
              <p className="text-[10px] text-gray-500">
                {TOOL_META[(c.toolName as string) ?? ''].description}
              </p>
            )}
          </Field>

          <ToolArgFields
            toolName={(c.toolName as string) ?? ''}
            args={
              typeof c.args === 'object' && c.args !== null
                ? (c.args as Record<string, string>)
                : {}
            }
            onChange={(newArgs) => setField('args', newArgs)}
          />
        </>
      )}

      {/* ── condition ── */}
      {type === 'condition' && (
        <Field label="Expression">
          <input
            className={inputCls}
            placeholder="e.g. {{score_1_output}} >= 7"
            value={(c.expression as string) ?? ''}
            onChange={(e) => setField('expression', e.target.value)}
          />
          <p className="text-[10px] text-gray-500">
            Operators: contains, not_contains, ==, !=, &gt;=, &lt;=, &gt;, &lt;
          </p>
        </Field>
      )}

      {/* ── human_pause ── */}
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

      {/* ── output ── */}
      {type === 'output' && (
        <Field label="Output template">
          <textarea
            className={`${inputCls} min-h-[100px] resize-y`}
            placeholder="{{score_1_output}}\n\n---\nProfile:\n{{extract_1_output}}"
            value={(c.template as string) ?? ''}
            onChange={(e) => setField('template', e.target.value)}
          />
          <p className="text-[10px] text-gray-500">
            Leave empty to pass through the previous node&apos;s output.
          </p>
        </Field>
      )}

      {/* ── Available variables hint ── */}
      {showVarsHint && <VariablesHint currentId={node.id} nodes={nodes} />}
    </aside>
  )
}
