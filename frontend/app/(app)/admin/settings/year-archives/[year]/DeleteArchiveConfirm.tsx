'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Trash2, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/Dialog'
import { deleteYearArchiveAction } from './actions'

interface Props {
  year: string
  isCurrent: boolean
  totalRows: number
}

export default function DeleteArchiveConfirm({ year, isCurrent, totalRows }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [pending, startTransition] = useTransition()

  const canSubmit = confirmText === year && !pending

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteYearArchiveAction({ year, confirmYear: confirmText })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      const total = Object.values(result.counts).reduce((a, b) => a + b, 0)
      toast.success(`Deleted ${year} archive · ${total} row${total === 1 ? '' : 's'} removed`)
      router.push('/admin/settings')
      router.refresh()
    })
  }

  if (isCurrent) {
    return (
      <div className="rounded-lg bg-surface-muted/60 border border-surface-border px-3 py-2.5 text-xs text-ink-muted">
        Cannot delete the school&apos;s active year. Switch to a different year on{' '}
        <a href="/admin/settings" className="text-brand-primary underline">/admin/settings</a> first.
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setConfirmText(''); setOpen(true) }}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 cursor-pointer"
      >
        <Trash2 className="w-4 h-4" /> Delete {year}
      </button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent showClose={!pending}>
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 text-red-600 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>Delete {year} archive?</DialogTitle>
              <DialogDescription className="mt-1 space-y-2 block">
                This permanently deletes <span className="font-semibold">{totalRows} row{totalRows === 1 ? '' : 's'}</span> of year-scoped data (grades, audit, assignments, remarks) for <span className="font-mono">{year}</span>. Students, teachers, classes, and subjects themselves are kept.
                <br /><br />
                <span className="text-red-700 font-semibold">This cannot be undone.</span>{' '}
                Make sure you&apos;ve exported the archive first.
              </DialogDescription>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <label htmlFor="confirm-year" className="text-xs font-medium text-ink-muted">
              Type <span className="font-mono font-bold text-ink">{year}</span> to confirm:
            </label>
            <input
              id="confirm-year"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input font-mono"
              placeholder={year}
              autoComplete="off"
              autoFocus
            />
          </div>

          <DialogFooter>
            <DialogClose className="btn-oauth" disabled={pending}>Cancel</DialogClose>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canSubmit}
              className="btn inline-flex bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                : <><Trash2 className="w-4 h-4" /> Delete permanently</>}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
