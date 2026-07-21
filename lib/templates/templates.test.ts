import { describe, it, expect } from 'vitest'
import { TEMPLATES } from '@/lib/templates'

describe('Template registry', () => {
  it('all four templates exist in the registry', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(ids).toContain('hello')
    expect(ids).toContain('lead-qualification')
    expect(ids).toContain('domain-risk')
    expect(ids).toContain('research-agent')
    expect(TEMPLATES).toHaveLength(4)
  })

  it('each template has required fields', () => {
    for (const t of TEMPLATES) {
      expect(typeof t.id).toBe('string')
      expect(typeof t.name).toBe('string')
      expect(typeof t.description).toBe('string')
      expect(typeof t.definition).toBe('object')
      expect(Array.isArray(t.defaultTestCases)).toBe(true)
      expect(t.defaultTestCases.length).toBeGreaterThan(0)
    }
  })

  it('each template definition has at least one input node and one output node', () => {
    for (const t of TEMPLATES) {
      const inputNodes = t.definition.nodes.filter((n) => n.type === 'input')
      const outputNodes = t.definition.nodes.filter((n) => n.type === 'output')
      expect(inputNodes.length).toBeGreaterThanOrEqual(1)
      expect(outputNodes.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('no template has duplicate node IDs', () => {
    for (const t of TEMPLATES) {
      const ids = t.definition.nodes.map((n) => n.id)
      expect(ids.length).toBe(new Set(ids).size)
    }
  })

  it('a human_pause node directly downstream of a condition node sets config.content', () => {
    // A condition node's own output is just "true"/"false" — a human_pause
    // relying on the default previousOutput fallback would show that boolean
    // instead of real upstream data (the domain-risk bug this guards against).
    for (const t of TEMPLATES) {
      const { nodes, edges } = t.definition
      for (const node of nodes) {
        if (node.type !== 'human_pause') continue
        const incoming = edges.find((e) => e.target === node.id)
        const source = incoming ? nodes.find((n) => n.id === incoming.source) : undefined
        if (source?.type === 'condition') {
          expect(
            (node.config as { content?: string }).content,
            `${t.id}'s "${node.label}" sits directly after condition "${source.label}" but has no config.content override`
          ).toBeTruthy()
        }
      }
    }
  })

  it('each defaultTestCase has non-empty input and expected fields', () => {
    for (const t of TEMPLATES) {
      for (const tc of t.defaultTestCases) {
        expect(typeof tc.input).toBe('string')
        expect(tc.input.length).toBeGreaterThan(0)
        expect(typeof tc.expected).toBe('string')
        expect(tc.expected.length).toBeGreaterThan(0)
      }
    }
  })
})
