'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { loginAction } from './actions'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, AlertCircle, MailCheck } from 'lucide-react'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}

type Mode = 'password' | 'magic'

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>('password')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [magicSending, setMagicSending] = useState(false)
  const [magicSentTo, setMagicSentTo] = useState<string | null>(null)

  const busy = isPending || googleLoading || magicSending

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    if (mode === 'magic') {
      const email = ((formData.get('email') as string) ?? '').trim()
      if (!email) return
      void sendMagicLink(email)
      return
    }

    startTransition(async () => {
      const result = await loginAction(formData)
      if (result?.error) setError(result.error)
    })
  }

  async function sendMagicLink(email: string) {
    setMagicSending(true)
    const supabase = createClient()
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Magic-link sign-in is for EXISTING staff only — the staff onboarding
        // flow at /register is the only path that should create new accounts.
        shouldCreateUser: false,
      },
    })
    if (otpError) {
      setError('Could not send the sign-in link. Please try again in a moment.')
      setMagicSending(false)
      return
    }
    setMagicSentTo(email)
    setMagicSending(false)
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (oauthError) {
      setError('Could not start Google sign-in. Please try again.')
      setGoogleLoading(false)
    }
  }

  // Magic-link success — replace the form with a confirmation
  if (magicSentTo) {
    return (
      <div className="space-y-5">
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-lg bg-brand-secondary-light border border-brand-secondary/30 text-ink"
        >
          <MailCheck className="w-5 h-5 mt-0.5 flex-shrink-0 text-brand-secondary-dark" />
          <div className="text-sm">
            <p className="font-medium">Check your inbox</p>
            <p className="text-ink-muted mt-1">
              If <strong>{magicSentTo}</strong> belongs to an approved staff account, a sign-in
              link is on its way. The link expires in 1 hour.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setMagicSentTo(null)
            setMode('password')
          }}
          className="text-sm font-medium text-brand-primary hover:text-brand-primary-dark transition-colors"
        >
          Use a different sign-in method
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Google — primary, frictionless path */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="btn-oauth"
      >
        {googleLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Connecting to Google…
          </>
        ) : (
          <>
            <GoogleIcon className="w-5 h-5" />
            Continue with Google
          </>
        )}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-surface-border" />
        <span className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
          or
        </span>
        <span className="h-px flex-1 bg-surface-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Email — always shown */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="you@school.edu.ng"
            className="input-brand"
            disabled={busy}
          />
        </div>

        {/* Password — only in password mode */}
        {mode === 'password' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-ink">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-brand-primary hover:text-brand-primary-dark transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="input-brand pr-12"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-ink-subtle hover:text-brand-primary cursor-pointer transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 p-3 rounded-lg bg-brand-primary-light border border-brand-primary/25 text-brand-primary-dark text-sm animate-shake"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={busy} className="btn-brand w-full mt-1">
          {mode === 'password' ? (
            isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
              </>
            ) : (
              'Sign in'
            )
          ) : magicSending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Sending link…
            </>
          ) : (
            'Email me a sign-in link'
          )}
        </button>

        {/* Mode toggle */}
        <div className="text-center pt-1">
          {mode === 'password' ? (
            <button
              type="button"
              onClick={() => switchMode('magic')}
              disabled={busy}
              className="text-sm font-medium text-brand-primary hover:text-brand-primary-dark transition-colors disabled:opacity-50"
            >
              Sign in with an email link instead
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchMode('password')}
              disabled={busy}
              className="text-sm font-medium text-brand-primary hover:text-brand-primary-dark transition-colors disabled:opacity-50"
            >
              Use email and password instead
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
