import { withRetry } from '@/lib/engine/with-retry'

const HF_URL =
  'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction'

/** Carries the HTTP status so withRetry can distinguish 429/5xx (retryable) from other 4xx. */
export class HuggingFaceApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'HuggingFaceApiError'
  }
}

export async function embed(text: string): Promise<number[]> {
  return withRetry(async () => {
    const res = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: text }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new HuggingFaceApiError(res.status, `HuggingFace API error ${res.status}: ${body}`)
    }

    const data: unknown = await res.json()
    if (!Array.isArray(data)) {
      throw new Error('Expected array response from HuggingFace Inference API')
    }

    // Batch response: number[][] — take first element
    const first = data[0]
    if (Array.isArray(first)) return first as number[]
    // Single response: number[]
    if (typeof first === 'number') return data as number[]
    throw new Error('Unexpected HuggingFace response shape')
  })
}
