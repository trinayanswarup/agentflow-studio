import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Strip any path appended to the Supabase project URL — the env var was
 * erroneously set with `/rest/v1/` as a suffix; createClient only wants
 * the bare origin.
 */
function normalizeUrl(raw: string): string {
  const parsed = new URL(raw)
  return `${parsed.protocol}//${parsed.host}`
}

export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(normalizeUrl(url), key, {
    auth: { persistSession: false },
  })
}
