'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, MailCheck } from 'lucide-react'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email) return
    setError(null)
    setSending(true)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      // Land the user on /auth/callback, which exchanges the code and then
      // forwards to /auth/update-password where they pick a new password.
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    })

    if (resetError) {
      // Don't expose whether the email exists; surface a soft message.
      setError('Could not send the reset link. Please try again in a moment.')
      setSending(false)
      return
    }

    setSent(true)
    setSending(false)
  }

  if (sent) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 p-4 rounded-lg bg-brand-secondary-light border border-brand-secondary/30 text-ink"
      >
        <MailCheck className="w-5 h-5 mt-0.5 flex-shrink-0 text-brand-secondary-dark" />
        <div className="text-sm">
          <p className="font-medium">Check your inbox</p>
          <p className="text-ink-muted mt-1">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to set a new password.
            The link expires in 1 hour.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
          disabled={sending}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

      <button type="submit" disabled={sending} className="btn-brand w-full">
        {sending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Sending link…
          </>
        ) : (
          'Send reset link'
        )}
      </button>
    </form>
  )
}
