/**
 * Readable slug generation for node output variables.
 * Client-safe — no server deps. Imported by both the runner and the editor UI.
 */

/**
 * Convert a node label to a safe lowercase slug used as a template variable
 * prefix, e.g. "Score Lead Fit" → "score_lead_fit".
 * Any run of non-alphanumeric characters becomes a single underscore;
 * leading/trailing underscores are stripped. Falls back to "node" for
 * labels that collapse to empty after stripping.
 */
export function labelToSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    || 'node'
  )
}

/**
 * Assign a unique slug to every node in `nodes`, disambiguating duplicate
 * labels by appending _2, _3, … in document order.
 *
 * Returns a Map from nodeId → slug.
 *
 * Example — two nodes both labelled "Extract":
 *   first  → "extract"
 *   second → "extract_2"
 */
export function buildSlugMap(
  nodes: ReadonlyArray<{ id: string; label: string }>
): Map<string, string> {
  const seen = new Map<string, number>()
  const result = new Map<string, string>()
  for (const node of nodes) {
    const base = labelToSlug(node.label)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    result.set(node.id, n === 0 ? base : `${base}_${n + 1}`)
  }
  return result
}
