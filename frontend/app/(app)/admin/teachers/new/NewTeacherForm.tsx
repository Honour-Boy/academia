'use client'

import { useState, useTransition } from 'react'
import { createTeacherAction } from '../actions'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function NewTeacherForm() {
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createTeacherAction(fd)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-ink mb-1.5">Full name</label>
        <input id="full_name" name="full_name" type="text" required autoComplete="name"
          placeholder="Mrs. Adewunmi" className="input" disabled={isPending} />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">Email address</label>
        <input id="email" name="email" type="email" required autoComplete="off" inputMode="email"
          placeholder="teacher@school.edu.ng" className="input" disabled={isPending} />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
          Temporary password
        </label>
        <div className="relative">
          <input id="password" name="password" type={showPw ? 'text' : 'password'} required
            minLength={8} placeholder="Min. 8 characters" className="input pr-12" disabled={isPending} />
          <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
            aria-label={showPw ? 'Hide' : 'Show'}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-ink-subtle hover:text-ink cursor-pointer">
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-ink-subtle mt-1">Share this privately. Teacher should change it on first login.</p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create teacher account'}
      </button>
    </form>
  )
}
