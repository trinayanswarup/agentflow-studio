import { describe, it, expect } from 'vitest'
import { chunkText } from '@/lib/rag/chunker'

describe('chunkText', () => {
  it('returns one chunk for short text under chunkSize', () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`)
    const result = chunkText(words.join(' '))
    // 100 words < default chunkSize of 500 → single chunk
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('word0')
  })

  it('produces correct chunk count for long text with overlap', () => {
    const words = Array.from({ length: 1100 }, (_, i) => `word${i}`)
    const result = chunkText(words.join(' '), 500, 50)
    // start=0:   push [0..499],   0+500=500 <1100 → start=450
    // start=450: push [450..949], 450+500=950 <1100 → start=900
    // start=900: push [900..1099], 900+500=1400 >=1100 → break
    expect(result).toHaveLength(3)
    expect(result[0].split(' ')).toHaveLength(500)
    expect(result[1].split(' ')).toHaveLength(500)
  })

  it('last word of chunk N appears at start of chunk N+1 (overlap)', () => {
    const words = Array.from({ length: 1100 }, (_, i) => `word${i}`)
    const result = chunkText(words.join(' '), 500, 50)
    // chunk[0] = words[0..499], last word = word499
    // chunk[1] = words[450..949], word499 is at position 49 inside it
    const lastWordOfChunk0 = result[0].split(' ').at(-1)!
    expect(result[1]).toContain(lastWordOfChunk0)
  })

  it('returns empty array for empty input', () => {
    expect(chunkText('')).toHaveLength(0)
    expect(chunkText('   ')).toHaveLength(0)
  })
})
