'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { UserCircle, ChevronRight, Loader2 } from 'lucide-react'

/**
 * Inline button that shows a spinner + emits a toast while the profile page
 * loads. `useTransition` keeps the click instant; pathname change clears
 * the spinner on land.
 */
export default function GoToProfileButton() {
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
      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs sm:text-sm font-semibold bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm ring-1 ring-white/20 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCircle className="w-4 h-4" />}
      <span>Go to profile</span>
      {!busy && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
    </button>
  )
}
