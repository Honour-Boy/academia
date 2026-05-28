import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * OAuth callback — Google redirects here with a `code`.
 *
 * We only exchange the code for a session here. All access decisions
 * (onboarding incomplete → /register, pending → holding screen, approved → app)
 * are centralised in the (app) layout, which already loads the profile. This
 * keeps a single source of truth for routing by account status.
 *
 * No grade data or internal detail is ever leaked back to /login.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const providerError = searchParams.get('error')

  // Behind Vercel's proxy the real host is forwarded; use it in production so
  // we don't redirect to an internal origin.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const base = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin

  // User cancelled the Google consent screen, or the provider errored.
  if (providerError || !code) {
    return NextResponse.redirect(`${base}/login?error=oauth`)
  }

  const supabase = await createClient()

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return NextResponse.redirect(`${base}/login?error=oauth`)
  }

  // Land on the dashboard; the (app) layout routes by account status.
  return NextResponse.redirect(`${base}/dashboard`)
}
