'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, Info, Loader2, Save } from 'lucide-react'
import { updateProfileAction, updatePasswordAction, setInitialPasswordAction } from './actions'

interface Props {
  defaultName: string
  defaultPhone: string
}

export function IdentityForm({ defaultName, defaultPhone }: Props) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState(defaultPhone)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const dirty = name !== defaultName || phone !== defaultPhone

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateProfileAction(fd)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success('Profile updated')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="full_name" className="label">Full name</label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a middle name if a colleague shares your first + last name"
          className="input mt-1"
          autoComplete="name"
        />
        <p className="text-xs text-ink-subtle mt-1">
          Must be unique across all staff and students (case-insensitive).
        </p>
      </div>

      <div>
        <label htmlFor="phone" className="label">Phone <span className="text-ink-subtle">(optional)</span></label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0803 000 0000"
          className="input mt-1"
          autoComplete="tel"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="btn-brand disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            : <><Save className="w-4 h-4" /> Save changes</>}
        </button>
        {dirty && !pending && (
          <button
            type="button"
            onClick={() => { setName(defaultName); setPhone(defaultPhone); setError(null) }}
            className="text-sm text-ink-muted hover:text-ink cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>
    </form>
  )
}

interface PasswordFormProps {
  /**
   * False when the user signed up via OAuth (e.g. Google) and has never had a
   * Supabase password. Forces the "set" variant — no current-password field,
   * no re-auth defence (there's nothing to re-auth against).
   */
  hasPassword: boolean
}

export function PasswordForm({ hasPassword }: PasswordFormProps) {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = hasPassword
        ? await updatePasswordAction(fd)
        : await setInitialPasswordAction(fd)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(
        hasPassword
          ? 'Password updated. Use it next time you sign in.'
          : 'Password set. You can now sign in with email and password as a backup to Google.',
      )
      setCurrent('')
      setNext('')
      setConfirm('')
      // Refresh so the server re-reads `user.identities` and the form may
      // switch to the standard change-password variant going forward.
      if (!hasPassword) router.refresh()
    })
  }

  const filled = hasPassword
    ? !!(current && next && confirm)
    : !!(next && confirm)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!hasPassword && (
        <div className="rounded-lg bg-brand-secondary-light/60 border border-brand-secondary/40 px-3 py-2.5 text-xs text-brand-accent-dark flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            You signed in with Google and don&apos;t have a password yet. Set one here as a
            backup &mdash; you&apos;ll still be able to use Google sign-in.
          </span>
        </div>
      )}

      {hasPassword && (
        <div>
          <label htmlFor="current_password" className="label">Current password</label>
          <div className="relative mt-1">
            <input
              id="current_password"
              name="current_password"
              type={showCurrent ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="input pr-12"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              tabIndex={-1}
              aria-label={showCurrent ? 'Hide' : 'Show'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-ink-subtle hover:text-ink cursor-pointer"
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="new_password" className="label">
          {hasPassword ? 'New password' : 'Password'}
        </label>
        <div className="relative mt-1">
          <input
            id="new_password"
            name="new_password"
            type={showNext ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="At least 8 characters"
            className="input pr-12"
          />
          <button
            type="button"
            onClick={() => setShowNext((v) => !v)}
            tabIndex={-1}
            aria-label={showNext ? 'Hide' : 'Show'}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-ink-subtle hover:text-ink cursor-pointer"
          >
            {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="confirm_password" className="label">
          {hasPassword ? 'Confirm new password' : 'Confirm password'}
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type={showNext ? 'text' : 'password'}
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={hasPassword ? 'Re-enter the new password' : 'Re-enter the password'}
          className="input mt-1"
        />
      </div>

      <button
        type="submit"
        disabled={pending || !filled}
        className="btn-brand disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> {hasPassword ? 'Updating…' : 'Setting…'}</>
          : hasPassword ? 'Update password' : 'Set password'}
      </button>
    </form>
  )
}
