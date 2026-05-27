import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Inline cookie-options type — avoids relying on @supabase/ssr's CookieOptions
// re-export which varies across patch versions. Covers every field that
// Next.js's cookieStore.set() actually accepts.
type CookieSetOptions = {
  path?: string
  domain?: string
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none' | boolean
  priority?: 'low' | 'medium' | 'high'
  partitioned?: boolean
}

/**
 * SSR Supabase client — scoped to the current user's session.
 * Safe to use in Server Components, Server Actions, and Route Handlers.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieSetOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — safe to ignore.
            // The middleware refreshes the session via its own setAll.
          }
        },
      },
    },
  )
}

/**
 * Service-role Supabase client — bypasses RLS.
 * NEVER import this on the client side or expose it to the browser.
 * Only use in Server Actions and Route Handlers that require admin access.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
