'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/Dialog'
import { Clock, ShieldCheck } from 'lucide-react'

/**
 * Per-role idle timeouts (minutes). Admins handle grade data + can deactivate
 * accounts — tighter window. Teachers have a longer one so they don't get
 * kicked mid-lesson.
 */
const IDLE_TIMEOUT_MIN: Record<'ADMIN' | 'TEACHER', number> = {
  ADMIN: 15,
  TEACHER: 30,
}
const WARNING_LEAD_MIN = 5  // Show modal this many minutes before sign-out.

// Activity throttle — at most one "I'm here" tick per N ms. Avoids hammering
// state on every mousemove pixel.
const ACTIVITY_THROTTLE_MS = 5_000

// Cross-tab channel name — every tab listening on this channel resets its
// timer when ANY tab sees activity, so leaving a long-running form open in
// one tab while reading in another keeps both alive.
const CHANNEL_NAME = 'academia:activity'

// Tick frequency for the warning countdown. 1s feels live without burning CPU.
const TICK_MS = 1_000

interface Props {
  role: 'ADMIN' | 'TEACHER'
}

export default function InactivityGuard({ role }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const timeoutMin = IDLE_TIMEOUT_MIN[role] ?? 30
  const timeoutMs = timeoutMin * 60 * 1000
  const warningAtMs = (timeoutMin - WARNING_LEAD_MIN) * 60 * 1000

  // Refs (not state) for lastActivity + signedOut to avoid re-renders on every event.
  const lastActivityRef = useRef<number>(Date.now())
  const lastBroadcastRef = useRef<number>(0)
  const signedOutRef = useRef<boolean>(false)
  const channelRef = useRef<BroadcastChannel | null>(null)

  // Only this triggers re-renders — when the warning modal needs to show or update.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const recordActivity = useCallback((broadcast = true) => {
    if (signedOutRef.current) return
    const now = Date.now()
    lastActivityRef.current = now
    // If the warning modal is up, dismiss it on activity.
    setSecondsLeft(null)
    if (broadcast && channelRef.current && now - lastBroadcastRef.current > ACTIVITY_THROTTLE_MS) {
      lastBroadcastRef.current = now
      try {
        channelRef.current.postMessage({ t: now })
      } catch {
        // ignore — channel might be closed during teardown
      }
    }
  }, [])

  const performSignOut = useCallback(async (reason: 'inactive' | 'session-ended') => {
    if (signedOutRef.current) return
    signedOutRef.current = true
    setSecondsLeft(null)
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // ignore — we redirect either way
    }
    router.replace(`/login?reason=${reason}`)
    router.refresh()
  }, [router, supabase])

  // Auth state listener — picks up SIGNED_OUT events from other tabs, from
  // password recovery, from admin deactivation, etc. Treat any auth loss as
  // "session ended" and bounce to login with context.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !signedOutRef.current) {
        performSignOut('session-ended')
      }
    })
    return () => { sub.subscription.unsubscribe() }
  }, [supabase, performSignOut])

  // Activity listeners + cross-tab channel + ticker.
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Channel setup
    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel(CHANNEL_NAME)
      channelRef.current = ch
      ch.onmessage = (ev) => {
        // Treat as activity but don't re-broadcast (no echo).
        if (ev.data && typeof ev.data.t === 'number') {
          lastActivityRef.current = Math.max(lastActivityRef.current, ev.data.t)
          setSecondsLeft(null)
        }
      }
    }

    const onActivity = () => recordActivity(true)
    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel',
    ]
    for (const e of events) window.addEventListener(e, onActivity, { passive: true })
    document.addEventListener('visibilitychange', () => {
      // Returning to a tab counts as activity so the user isn't kicked the
      // moment they switch back.
      if (document.visibilityState === 'visible') recordActivity(true)
    })

    // Initial activity tick so the timer starts now.
    recordActivity(false)

    // Ticker: every TICK_MS, see how long since last activity. Shows warning,
    // or signs out, as appropriate.
    const ticker = window.setInterval(() => {
      if (signedOutRef.current) return
      const elapsed = Date.now() - lastActivityRef.current
      if (elapsed >= timeoutMs) {
        performSignOut('inactive')
        return
      }
      if (elapsed >= warningAtMs) {
        const remaining = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000))
        setSecondsLeft(remaining)
      } else if (secondsLeft !== null) {
        // Activity (here or another tab) bumped lastActivity back below the
        // warning threshold — clear the modal.
        setSecondsLeft(null)
      }
    }, TICK_MS)

    return () => {
      for (const e of events) window.removeEventListener(e, onActivity)
      window.clearInterval(ticker)
      channelRef.current?.close()
      channelRef.current = null
    }
    // We intentionally don't depend on secondsLeft — that would tear down /
    // recreate listeners every tick. The interval reads `secondsLeft` via
    // closure on the FIRST mount; subsequent updates happen via setSecondsLeft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs, warningAtMs, recordActivity, performSignOut])

  // "Stay signed in" — bump activity to now.
  const handleStay = useCallback(() => {
    recordActivity(true)
  }, [recordActivity])

  const showWarning = secondsLeft !== null && !signedOutRef.current
  const minutesPart = secondsLeft != null ? Math.floor(secondsLeft / 60) : 0
  const secondsPart = secondsLeft != null ? secondsLeft % 60 : 0

  return (
    <Dialog
      open={showWarning}
      onOpenChange={(open) => {
        // Closing the modal counts as activity.
        if (!open) handleStay()
      }}
    >
      <DialogContent showClose={false}>
        <div className="flex items-start gap-3 mb-1">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-brand-secondary-light text-brand-secondary-dark flex-shrink-0">
            <Clock className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle>Still there?</DialogTitle>
            <DialogDescription className="mt-1">
              You&apos;ll be signed out automatically due to inactivity. Any movement, key press, or click on this window will keep you signed in.
            </DialogDescription>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-brand-primary/30 bg-brand-primary-light/40 px-4 py-3 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-brand-primary flex-shrink-0" />
          <p className="text-sm text-ink">
            Signing out in{' '}
            <span className="font-mono font-bold text-brand-primary-dark">
              {minutesPart > 0 ? `${minutesPart}m ` : ''}{secondsPart}s
            </span>
          </p>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => performSignOut('inactive')}
            className="btn-oauth"
          >
            Sign out now
          </button>
          <button
            type="button"
            onClick={handleStay}
            className="btn-brand"
            autoFocus
          >
            Stay signed in
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
