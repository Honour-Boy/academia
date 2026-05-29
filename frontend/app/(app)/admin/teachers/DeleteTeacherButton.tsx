'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/Dialog'
import { deleteTeacherAction } from './actions'

interface Props {
  teacherId: string
  teacherName: string
  isAdmin: boolean
  isSelf: boolean
  soleActiveAdmin: boolean
}

/**
 * Hard-delete UI for a teacher/admin row. The "hard" delete is a soft delete
 * server-side (deleted_at + auth ban) so historical FK references stay
 * intact, but to the admin it looks like the row is permanently gone from
 * every staff list afterwards.
 *
 * Always confirmation-gated — typing the teacher's name to confirm.
 */
export default function DeleteTeacherButton({
  teacherId, teacherName, isAdmin, isSelf, soleActiveAdmin,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')

  const blockedReason: string | null = (() => {
    if (isAdmin && !isSelf) return "Admins can't delete another admin's account."
    if (isAdmin && isSelf && soleActiveAdmin) {
      return "You're the only active admin. Promote another admin first."
    }
    return null
  })()

  function run() {
    if (confirmName.trim().toLowerCase() !== teacherName.trim().toLowerCase()) {
      toast.error('Typed name does not match — delete cancelled')
      return
    }
    startTransition(async () => {
      const res = await deleteTeacherAction(teacherId)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${teacherName} deleted permanently`)
      setOpen(false)
      setConfirmName('')
    })
  }

  function tryOpen() {
    if (blockedReason) {
      toast.error(blockedReason)
      return
    }
    setOpen(true)
  }

  const nameMatches = confirmName.trim().toLowerCase() === teacherName.trim().toLowerCase()

  return (
    <>
      <button
        type="button"
        onClick={tryOpen}
        disabled={isPending || !!blockedReason}
        title={blockedReason ?? 'Delete permanently'}
        aria-label="Delete"
        className="btn text-xs px-3 py-1.5 min-h-0 btn-secondary text-red-700 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        <span>Delete</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmName('') }}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 text-red-600">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <DialogTitle>Delete this account?</DialogTitle>
            </div>
            <DialogDescription className="pt-2 space-y-2">
              <span className="block">
                You&apos;re about to permanently delete <span className="font-semibold text-ink">{teacherName}</span>&apos;s account.
              </span>
              <span className="block">
                They&apos;ll be signed out of all sessions and removed from every staff list, search, and dropdown.
                Historical references (audit log, grade entries) keep the placeholder so reports don&apos;t break.
              </span>
              <span className="block text-red-700 font-medium">
                This is reversible only by a database administrator. Type the name below to confirm.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-1">
            <label htmlFor="confirm-name" className="block text-xs font-medium uppercase tracking-wider text-ink-subtle mb-1.5">
              Type <span className="font-mono text-ink normal-case">{teacherName}</span> to confirm
            </label>
            <input
              id="confirm-name"
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              className="input-brand"
              placeholder={teacherName}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => { setOpen(false); setConfirmName('') }}
              disabled={isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={run}
              disabled={isPending || !nameMatches}
              className="btn-brand bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete permanently'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
