'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

type Status = 'checking' | 'ready' | 'no-session'

export default function UpdatePasswordForm() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // The user lands here EITHER from /auth/callback (PKCE, our reset flow) with
  // a session already set, OR directly from a Supabase-dashboard "Send recovery"
  // email that puts an access token in the URL hash (browser client picks it up
  // automatically). Either way, we only show the form if there's a session.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function check() {
      // Give the browser client a tick to parse a hash-fragment session.
      await new Promise((r) => setTimeout(r, 50))
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      setStatus(data.session ? 'ready' : 'no-session')
    }
    check()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError('Could not update your password. Please try the link again or request a new one.')
      setSubmitting(false)
      return
    }

    setDone(true)
    setSubmitting(false)
    // Brief pause so the user sees the confirmation, then route through the
    // (app) layout — which sends approved/active users to the dashboard.
    setTimeout(() => router.replace('/dashboard'), 1200)
  }

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center py-6 text-ink-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="ml-2 text-sm">Verifying your link…</span>
      </div>
    )
  }

  if (status === 'no-session') {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-lg bg-brand-primary-light border border-brand-primary/25 text-brand-primary-dark text-sm"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            This reset link is invalid or has expired. Request a new one to continue.
          </span>
        </div>
        <Link href="/forgot-password" className="btn-brand w-full">
          Request a new reset link
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 p-4 rounded-lg bg-brand-secondary-light border border-brand-secondary/30 text-ink"
      >
        <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0 text-brand-secondary-dark" />
        <div className="text-sm">
          <p className="font-medium">Password updated</p>
          <p className="text-ink-muted mt-1">Redirecting you to the dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            className="input-brand pr-12"
            disabled={submitting}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-ink mb-1.5">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Re-enter your new password"
          className="input-brand"
          disabled={submitting}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 p-3 rounded-lg bg-brand-primary-light border border-brand-primary/25 text-brand-primary-dark text-sm animate-shake"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" disabled={submitting} className="btn-brand w-full">
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Saving…
          </>
        ) : (
          'Save new password'
        )}
      </button>
    </form>
  )
}
