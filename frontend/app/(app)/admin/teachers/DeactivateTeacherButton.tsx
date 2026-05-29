'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/Dialog'
import { toggleTeacherStatusAction } from './actions'

interface Props {
  teacherId: string
  teacherName: string
  isActive: boolean
  /** Target row is an ADMIN. */
  isAdmin: boolean
  /** Target row is the current signed-in user. */
  isSelf: boolean
  /** Target is an admin who is the only currently active admin. Blocks self-deactivation entirely. */
  soleActiveAdmin: boolean
}

export default function DeactivateTeacherButton({
  teacherId, teacherName, isActive, isAdmin, isSelf, soleActiveAdmin,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Hard guards — surface up-front so the admin doesn't even attempt the click.
  // The server action enforces these too, so a tampered DOM can't bypass them.
  const blockedReason: string | null = (() => {
    if (!isActive) return null
    if (isAdmin && !isSelf) {
      return "Admins can't deactivate another admin's account. Ask them to deactivate themselves."
    }
    if (isAdmin && isSelf && soleActiveAdmin) {
      return "You're the only active admin. Promote another admin first — otherwise no one could reactivate you."
    }
    return null
  })()

  async function run(newStatus: boolean) {
    startTransition(async () => {
      const res = await toggleTeacherStatusAction(teacherId, newStatus)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      if (!newStatus) {
        toast.success(
          isSelf
            ? "Your account has been deactivated. You'll be signed out."
            : `${teacherName} deactivated`,
        )
      } else {
        toast.success(`${teacherName} reactivated`)
      }
    })
  }

  function onClick() {
    if (blockedReason) {
      toast.error(blockedReason)
      return
    }
    // Confirmation required when deactivating self. Bulk-reactivate or
    // deactivating someone else is a single tap as before.
    if (isActive && isSelf) {
      setConfirmOpen(true)
      return
    }
    void run(!isActive)
  }

  const disabled = isPending || !!blockedReason
  const label = isActive ? 'Deactivate' : 'Reactivate'

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title={blockedReason ?? undefined}
        className={`btn text-xs px-3 py-1.5 min-h-0 ${
          isActive
            ? 'btn-secondary text-red-600 hover:border-red-300'
            : 'btn-secondary text-brand hover:border-brand/40'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : label}
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 text-red-600">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <DialogTitle>Deactivate your own account?</DialogTitle>
            </div>
            <DialogDescription className="pt-2 space-y-2">
              <span className="block">
                You&apos;re about to deactivate <span className="font-semibold text-ink">your own admin account</span>.
              </span>
              <span className="block">
                You&apos;ll be signed out immediately and <span className="font-semibold text-ink">won&apos;t be able to sign back in</span> until
                another administrator reactivates you from this page.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setConfirmOpen(false); void run(false) }}
              disabled={isPending}
              className="btn-brand bg-red-600 hover:bg-red-700"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, deactivate me'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
