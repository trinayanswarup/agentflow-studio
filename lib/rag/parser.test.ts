import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// mammoth is a static top-level import in parser.ts, so vi.mock() intercepts it correctly.
// pdf-parse is required via require() inside the function body (CJS dynamic require).
// vi.mock cannot intercept CJS require() inside function bodies in Vitest's Node runner,
// so we pass a real valid PDF from pdf-parse's own test suite (no network — purely local).

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({ value: 'extracted docx text', messages: [] }),
  },
}))

import { parseFile } from '@/lib/rag/parser'

describe('parseFile', () => {
  it('pdf returns a string from a valid PDF buffer', async () => {
    // Reads a valid PDF shipped with the installed pdf-parse package — offline, no API calls.
    const pdfBuf = fs.readFileSync(
      path.join(process.cwd(), 'node_modules/pdf-parse/test/data/01-valid.pdf')
    )
    const result = await parseFile(pdfBuf, 'pdf')
    expect(typeof result).toBe('string')
  })

  it('docx returns extracted text from mammoth mock', async () => {
    const buf = Buffer.from('fake docx bytes')
    const result = await parseFile(buf, 'docx')
    expect(result).toBe('extracted docx text')
  })

  it('unsupported filetype throws', async () => {
    const buf = Buffer.from('fake')
    await expect(parseFile(buf, 'txt' as unknown as 'pdf')).rejects.toThrow('Unsupported filetype')
  })
})
