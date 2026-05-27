'use client'

import { useState, useTransition } from 'react'
import { loginAction } from './actions'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await loginAction(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Email */}
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
          className="input"
          disabled={isPending}
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="input pr-12"
            disabled={isPending}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-ink-subtle hover:text-ink cursor-pointer transition-colors"
            tabIndex={-1}
          >
            {showPassword
              ? <EyeOff className="w-5 h-5" />
              : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="btn-primary w-full mt-2"
      >
        {isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
          : 'Sign in'}
      </button>
    </form>
  )
}
