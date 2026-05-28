'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2, Monitor, Smartphone, Tablet, Globe, LogOut, ShieldAlert,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/Dialog'
import { signOutEverywhereAction, signOutOtherSessionsAction } from './actions'

export interface SessionRow {
  id: string
  createdAt: string
  refreshedAt: string | null
  userAgent: string | null
  ip: string | null
  isCurrent: boolean
}

interface Props {
  sessions: SessionRow[]
}

// Compact user-agent parsing — just enough to label a row without pulling in
// a 50KB UA-parser library.
function describeUA(ua: string | null): { device: 'desktop' | 'mobile' | 'tablet' | 'unknown'; label: string } {
  if (!ua) return { device: 'unknown', label: 'Unknown device' }
  const lower = ua.toLowerCase()
  let device: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'desktop'
  if (/(iphone|android(?!.*tablet)|mobile)/i.test(ua)) device = 'mobile'
  else if (/(ipad|tablet)/i.test(ua)) device = 'tablet'

  let browser = 'Browser'
  if (lower.includes('edg/')) browser = 'Edge'
  else if (lower.includes('chrome/') && !lower.includes('chromium')) browser = 'Chrome'
  else if (lower.includes('firefox/')) browser = 'Firefox'
  else if (lower.includes('safari/') && !lower.includes('chrome')) browser = 'Safari'

  let os = ''
  if (lower.includes('windows nt')) os = 'Windows'
  else if (lower.includes('mac os x') || lower.includes('macintosh')) os = 'macOS'
  else if (lower.includes('android')) os = 'Android'
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS'
  else if (lower.includes('linux')) os = 'Linux'

  return { device, label: os ? `${browser} on ${os}` : browser }
}

function DeviceIcon({ kind, className }: { kind: 'desktop' | 'mobile' | 'tablet' | 'unknown'; className?: string }) {
  if (kind === 'mobile') return <Smartphone className={className} />
  if (kind === 'tablet') return <Tablet className={className} />
  if (kind === 'desktop') return <Monitor className={className} />
  return <Globe className={className} />
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffMs = Date.now() - then
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function SessionsCard({ sessions }: Props) {
  const router = useRouter()
  const [pendingOthers, startOthers] = useTransition()
  const [pendingGlobal, startGlobal] = useTransition()
  const [confirmGlobal, setConfirmGlobal] = useState(false)

  function signOutOthers() {
    startOthers(async () => {
      const result = await signOutOtherSessionsAction()
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Other devices signed out')
      router.refresh()
    })
  }

  function signOutEverywhere() {
    startGlobal(async () => {
      const result = await signOutEverywhereAction()
      if (result && 'error' in result) {
        toast.error(result.error)
        setConfirmGlobal(false)
      }
      // On success the action redirects to /login; nothing else to do.
    })
  }

  const otherCount = sessions.filter((s) => !s.isCurrent).length

  return (
    <div className="space-y-4">
      {sessions.length === 0 ? (
        <p className="text-sm text-ink-muted italic">
          No active sessions found. (This is unusual — your current sign-in should appear.)
        </p>
      ) : (
        <ul className="divide-y divide-surface-border rounded-lg ring-1 ring-surface-border overflow-hidden">
          {sessions.map((s) => {
            const ua = describeUA(s.userAgent)
            return (
              <li
                key={s.id}
                className={cn(
                  'flex items-center gap-3 px-3 sm:px-4 py-3',
                  s.isCurrent && 'bg-brand-primary-light/40',
                )}
              >
                <span className={cn(
                  'inline-flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0',
                  s.isCurrent ? 'bg-brand-primary text-white' : 'bg-surface-muted text-ink-muted',
                )}>
                  <DeviceIcon kind={ua.device} className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate flex items-center gap-2">
                    {ua.label}
                    {s.isCurrent && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider bg-brand-primary text-white px-1.5 py-0.5 rounded">
                        <Check className="w-2.5 h-2.5" /> This device
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-subtle mt-0.5">
                    Last active {relativeTime(s.refreshedAt ?? s.createdAt)}
                    {s.ip && <> &middot; <span className="font-mono">{s.ip}</span></>}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button
          type="button"
          onClick={signOutOthers}
          disabled={pendingOthers || otherCount === 0}
          className="btn-oauth inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pendingOthers
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <LogOut className="w-4 h-4" />}
          Sign out other devices ({otherCount})
        </button>
        <button
          type="button"
          onClick={() => setConfirmGlobal(true)}
          disabled={pendingGlobal}
          className="btn-oauth inline-flex items-center gap-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShieldAlert className="w-4 h-4" />
          Sign out everywhere
        </button>
      </div>

      <Dialog open={confirmGlobal} onOpenChange={(open) => !pendingGlobal && setConfirmGlobal(open)}>
        <DialogContent showClose={!pendingGlobal}>
          <DialogTitle>Sign out everywhere?</DialogTitle>
          <DialogDescription className="mt-2">
            This signs you out of every device, including this one. You&apos;ll be sent back to the login screen and will need to sign in again.
          </DialogDescription>
          <DialogFooter>
            <DialogClose className="btn-oauth" disabled={pendingGlobal}>Cancel</DialogClose>
            <button
              type="button"
              onClick={signOutEverywhere}
              disabled={pendingGlobal}
              className="btn inline-flex bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
            >
              {pendingGlobal
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing out…</>
                : 'Sign out everywhere'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
