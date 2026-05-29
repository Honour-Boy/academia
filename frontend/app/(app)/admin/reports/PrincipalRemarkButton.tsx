'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Loader2, Save } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/Dialog'
import { upsertPrincipalRemarkAction } from './actions'

interface Props {
  studentId: string
  studentName: string
  term: string
  year: string
  /** Existing remark for this (student, term, year), if any. */
  initialRemark: string | null
}

const MAX_LEN = 1000

/**
 * Per-student "Principal remark" pill on the admin reports list. Click to
 * open a textarea, save, and the value flows straight into the PDF on the
 * next download (admin's principal_remark is read by buildReportData and
 * rendered in the REMARKS section).
 */
export default function PrincipalRemarkButton({
  studentId, studentName, term, year, initialRemark,
}: Props) {
  const [open, setOpen] = useState(false)
  const [remark, setRemark] = useState(initialRemark ?? '')
  const [savedRemark, setSavedRemark] = useState(initialRemark ?? '')
  const [pending, startTransition] = useTransition()

  const hasValue = savedRemark.trim().length > 0
  const dirty = remark.trim() !== savedRemark.trim()
  const tooLong = remark.length > MAX_LEN

  function save() {
    if (tooLong) {
      toast.error(`Remark is too long (max ${MAX_LEN} characters)`)
      return
    }
    startTransition(async () => {
      const res = await upsertPrincipalRemarkAction({
        studentId,
        term,
        academicYear: year,
        remark,
      })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Principal remark saved for ${studentName}`)
      setSavedRemark(remark.trim())
      setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setRemark(savedRemark); setOpen(true) }}
        aria-label={`Principal remark for ${studentName}`}
        title={hasValue ? 'Edit principal remark' : 'Add principal remark'}
        className={
          'inline-flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors ' +
          (hasValue
            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
            : 'text-ink-muted hover:text-brand-accent hover:bg-brand-accent/10')
        }
      >
        <MessageSquare className="w-4 h-4" />
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setRemark(savedRemark) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Principal remark · {studentName}</DialogTitle>
            <DialogDescription>
              {term} · {year}. This appears under <span className="font-semibold text-ink">Principal&apos;s Remark</span> on the downloaded report PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={5}
              maxLength={MAX_LEN + 100}
              placeholder="e.g. Keep up the excellent work this term."
              className="input-brand resize-y w-full font-sans text-sm leading-relaxed"
              autoFocus
            />
            <div className="flex items-center justify-between text-[11px] text-ink-subtle">
              <span>{hasValue ? 'Replace to update, or clear to remove.' : 'Leave empty to add nothing.'}</span>
              <span className={tooLong ? 'text-red-600 font-medium' : ''}>
                {remark.length}/{MAX_LEN}
              </span>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-brand inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={save}
              disabled={pending || !dirty || tooLong}
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
