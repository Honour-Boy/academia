import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Auth callback — destination for Google OAuth, magic-link, and password-recovery
 * email links. We exchange the PKCE `code` for a session, then forward to either
 * `?next=` (e.g. /auth/update-password for recovery flows) or the dashboard.
 *
 * Access decisions (onboarding incomplete → /register, pending → holding screen,
 * approved → app) live in the (app) layout, so this handler stays minimal.
 *
 * No grade data or internal detail is ever leaked back to /login.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const providerError = searchParams.get('error')
  // Only accept relative same-origin paths to prevent open-redirect abuse.
  const nextParam = searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : '/dashboard'

  // Behind Vercel's proxy the real host is forwarded; use it in production so
  // we don't redirect to an internal origin.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const base = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin

  // OAuth provider rejected the user, or the link is missing the auth code.
  if (providerError) {
    return NextResponse.redirect(`${base}/login?error=oauth`)
  }
  if (!code) {
    return NextResponse.redirect(`${base}/login?error=link`)
  }

  const supabase = await createClient()

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    // Logged server-side so we can diagnose PKCE verifier mismatches without
    // leaking detail to the client.
    console.error('[auth/callback] exchangeCodeForSession failed:', exchangeError.message)
    return NextResponse.redirect(`${base}/login?error=session`)
  }

  return NextResponse.redirect(`${base}${next}`)
}
