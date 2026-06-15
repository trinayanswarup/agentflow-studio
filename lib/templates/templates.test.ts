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
