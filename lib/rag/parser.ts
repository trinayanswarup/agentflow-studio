import mammoth from 'mammoth'

export async function parseFile(buffer: Buffer, filetype: 'pdf' | 'docx'): Promise<string> {
  if (filetype === 'pdf') {
    // require the core parser directly — skips the test-file loader in pdf-parse's index.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParseLib = require('pdf-parse/lib/pdf-parse')
    const pdfParse = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default
    const result = await pdfParse(buffer) as { text: string }
    return result.text
  }
  if (filetype === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  throw new Error(`Unsupported filetype: ${filetype as string}`)
}
