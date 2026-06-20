export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const chunks: string[] = []
  let start = 0

  while (start < words.length) {
    chunks.push(words.slice(start, start + chunkSize).join(' '))
    if (start + chunkSize >= words.length) break
    start += chunkSize - overlap
  }

  return chunks
}
