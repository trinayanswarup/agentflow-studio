import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

function normalizeUrl(raw: string): string {
  const parsed = new URL(raw)
  return `${parsed.protocol}//${parsed.host}`
}

let _client: SupabaseClient | null = null

/** Singleton browser client — safe to call from any client component. */
export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
    if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')
    _client = createClient(normalizeUrl(url), key)
  }
  return _client
}
