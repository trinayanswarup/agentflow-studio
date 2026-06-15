/**
 * Integration tests for the tool_call execution path.
 * These use real API calls — no mocking. Set env vars before running:
 *   GROQ_API_KEY, TAVILY_API_KEY
 *
 * Tests cover:
 *  1. web_fetch with a literal URL
 *  2. web_fetch where the URL comes from a template variable
 *  3. evaluate_output with mapped output + literal criteria
 *  4. Missing argument → friendly validation error (not raw Zod message)
 *  5. Unknown template variable → friendly validation error (empty value)
 */

import { it, expect, beforeAll } from 'vitest'
import { executeToolCall } from './tool-call'
import { createContext, setNodeOutput } from '@/lib/engine/context'
import type { ToolCallNode } from '@/lib/types'

// Ensure tools are registered before any test runs.
beforeAll(async () => {
  await import('@/lib/tools/web-fetch')
  await import('@/lib/tools/web-search')
  await import('@/lib/tools/extract-json')
  await import('@/lib/tools/send-webhook')
  await import('@/lib/tools/evaluate-output')
})

function makeNode(toolName: string, args: Record<string, string>): ToolCallNode {
  return {
    id: 'test_1',
    type: 'tool_call',
    label: 'Test Tool Call',
    config: { toolName, args },
  }
}

// ── 1. web_fetch: literal URL ─────────────────────────────────────────────────

it('web_fetch: fetches a real page when given a literal URL', async () => {
  const node = makeNode('web_fetch', { url: 'https://example.com' })
  const ctx = createContext('test input')

  const result = await executeToolCall(node, ctx)

  expect(typeof result.output).toBe('string')
  expect(result.output.length).toBeGreaterThan(10)
  // HTML tags should be stripped
  expect(result.output).not.toMatch(/<html|<body|<div/)
}, 20_000)

// ── 2. web_fetch: URL from a template variable ────────────────────────────────

it('web_fetch: resolves {{nodeId_output}} template before fetching', async () => {
  const node = makeNode('web_fetch', { url: '{{upstream_1_output}}' })
  const ctx = createContext('test input')
  setNodeOutput(ctx, 'upstream_1', 'https://example.com')

  const result = await executeToolCall(node, ctx)

  expect(typeof result.output).toBe('string')
  expect(result.output.length).toBeGreaterThan(10)
}, 20_000)

// ── 3. evaluate_output: mapped output + literal criteria ─────────────────────

it('evaluate_output: returns a score 1-10 and a reasoning string', async () => {
  const node = makeNode('evaluate_output', {
    output: '{{draft_output}}',
    criteria: 'The text should mention a company name and be under 200 words.',
  })
  const ctx = createContext('test input')
  setNodeOutput(
    ctx,
    'draft',
    'Acme Corp is a fast-growing SaaS startup founded in 2019, headquartered in Berlin.'
  )

  const result = await executeToolCall(node, ctx)

  const parsed: unknown = JSON.parse(result.output)
  expect(parsed).toMatchObject({
    score: expect.any(Number),
    reasoning: expect.any(String),
  })
  const { score } = parsed as { score: number; reasoning: string }
  expect(score).toBeGreaterThanOrEqual(1)
  expect(score).toBeLessThanOrEqual(10)
}, 30_000)

// ── 4. Missing argument → friendly error ─────────────────────────────────────

it('web_fetch: missing url argument produces a friendly validation error', async () => {
  const node = makeNode('web_fetch', {})
  const ctx = createContext('test input')

  await expect(executeToolCall(node, ctx)).rejects.toThrow(/web_fetch needs 'url'/)
})

// ── 5. Invalid template reference → friendly error ───────────────────────────

it('web_fetch: unknown template variable resolves to empty → friendly error', async () => {
  // {{does_not_exist_output}} resolves to '' because context has no such key.
  const node = makeNode('web_fetch', { url: '{{does_not_exist_output}}' })
  const ctx = createContext('test input')

  await expect(executeToolCall(node, ctx)).rejects.toThrow(/web_fetch needs 'url'/)
})

// ── 8. web_search missing query → friendly error ──────────────────────────────

it('web_search: missing query argument returns friendly error', async () => {
  const node = makeNode('web_search', {})
  const ctx = createContext('test input')

  await expect(executeToolCall(node, ctx)).rejects.toThrow(/query/)
})

// ── 9. send_webhook non-URL → friendly error ──────────────────────────────────

it('send_webhook: non-URL value for url returns friendly error', async () => {
  const node = makeNode('send_webhook', { url: 'not-a-url', payload: 'hello' })
  const ctx = createContext('test input')

  await expect(executeToolCall(node, ctx)).rejects.toThrow(/url/)
})

// ── 10–11. jsonPath utility (pure, no API calls) ──────────────────────────────

import { jsonPath } from '@/lib/tools/extract-json'

it('extract_json: valid path extracts correct value from nested JSON', () => {
  const data: unknown = JSON.parse('{"company":{"name":"Acme"}}')
  expect(jsonPath(data, 'company.name')).toBe('Acme')
})

it('extract_json: missing path returns friendly error containing "not found"', () => {
  const data: unknown = JSON.parse('{"company":{"name":"Acme"}}')
  expect(() => jsonPath(data, 'company.ceo')).toThrow(/not found|path/)
})
