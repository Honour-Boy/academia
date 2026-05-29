'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { UserCircle, ChevronRight, Loader2 } from 'lucide-react'

/**
 * Admin Settings → "My profile" card with a click loader and a "Opening…"
 * toast so the click feels instant even when the page server-renders.
 */
export default function GoToProfileCard() {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [navigating, setNavigating] = useState(false)

  useEffect(() => {
    if (navigating) setNavigating(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const busy = pending || navigating

  return (
    <button
      type="button"
      onClick={() => {
        if (busy) return
        setNavigating(true)
        toast('Opening your profile…', { duration: 1500 })
        startTransition(() => router.push('/profile'))
      }}
      disabled={busy}
      aria-busy={busy}
      className="w-full text-left card p-5 sm:p-6 flex items-center gap-4 group hover:border-brand-primary/40 hover:shadow-md transition-all cursor-pointer disabled:opacity-70 disabled:cursor-wait"
    >
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-primary-light text-brand-primary-dark flex-shrink-0">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCircle className="w-5 h-5" />}
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold text-ink group-hover:text-brand-primary transition-colors">My profile</h3>
        <p className="text-xs text-ink-muted mt-0.5">
          {busy ? 'Opening your profile…' : 'Edit your name, phone number, or password.'}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-ink-subtle group-hover:text-brand-primary transition-colors flex-shrink-0" />
    </button>
  )
}
