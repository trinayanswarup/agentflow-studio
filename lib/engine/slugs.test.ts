import { describe, it, expect } from 'vitest'
import { labelToSlug, buildSlugMap } from './slugs'

describe('labelToSlug', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(labelToSlug('Website URL')).toBe('website_url')
  })
  it('collapses runs of non-alphanumeric chars to a single underscore', () => {
    expect(labelToSlug('Score Lead Fit')).toBe('score_lead_fit')
    expect(labelToSlug('Fetch  Website')).toBe('fetch_website')
    expect(labelToSlug('A -- B')).toBe('a_b')
  })
  it('trims leading and trailing underscores', () => {
    expect(labelToSlug('  hello  ')).toBe('hello')
    expect(labelToSlug('!Hello!')).toBe('hello')
  })
  it('falls back to "node" for empty or all-special labels', () => {
    expect(labelToSlug('')).toBe('node')
    expect(labelToSlug('!!!')).toBe('node')
  })
  it('preserves numbers', () => {
    expect(labelToSlug('Step 2 Review')).toBe('step_2_review')
  })
})

describe('buildSlugMap', () => {
  it('assigns each node its slug', () => {
    const nodes = [
      { id: 'a', label: 'Website URL' },
      { id: 'b', label: 'Fetch Website' },
    ]
    const map = buildSlugMap(nodes)
    expect(map.get('a')).toBe('website_url')
    expect(map.get('b')).toBe('fetch_website')
  })
  it('disambiguates duplicate labels with _2, _3 suffixes', () => {
    const nodes = [
      { id: 'x', label: 'Extract' },
      { id: 'y', label: 'Extract' },
      { id: 'z', label: 'Extract' },
    ]
    const map = buildSlugMap(nodes)
    expect(map.get('x')).toBe('extract')
    expect(map.get('y')).toBe('extract_2')
    expect(map.get('z')).toBe('extract_3')
  })
  it('does not count non-duplicate labels against each other', () => {
    const nodes = [
      { id: 'a', label: 'Search' },
      { id: 'b', label: 'Search' },
      { id: 'c', label: 'Review' },
    ]
    const map = buildSlugMap(nodes)
    expect(map.get('a')).toBe('search')
    expect(map.get('b')).toBe('search_2')
    expect(map.get('c')).toBe('review')
  })
  it('handles an empty node list', () => {
    expect(buildSlugMap([])).toEqual(new Map())
  })
})
