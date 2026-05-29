'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, Loader2, Save, ArrowRight, Copy, SkipForward } from 'lucide-react'
import { TERMS, type Term } from '@/lib/grade-utils'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/Dialog'
import { copyTermAssignmentsAction, updateSchoolSettingsAction } from './actions'

interface Props {
  initialTerm: Term
  initialYear: string
  /**
   * Every academic_year that has rows in any year-scoped table. Drives the
   * "backward to existing year" check: if the target year is in this list,
   * we skip the wizard and just flip the active year (the year is browsed in
   * view-only mode from then on, since the school is now "in" a past year).
   */
  knownYears: string[]
  lastUpdatedAt: string | null
  lastUpdatedBy: string | null
}

/** "2025/2026" → 2025. Returns null on garbage input. */
function parseYearStart(value: string): number | null {
  const m = value.trim().match(/^(\d{4})\/\d{4}$/)
  return m ? parseInt(m[1], 10) : null
}

export default function SettingsForm({
  initialTerm, initialYear, knownYears, lastUpdatedAt, lastUpdatedBy,
}: Props) {
  const router = useRouter()
  const [term, setTerm] = useState<Term>(initialTerm)
  const [year, setYear] = useState(initialYear)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Modal state for the "save flow" decision tree.
  const [showTermModal, setShowTermModal] = useState(false)
  const [showYearModal, setShowYearModal] = useState(false)
  const [showBackwardSwitchModal, setShowBackwardSwitchModal] = useState(false)

  const dirty = term !== initialTerm || year !== initialYear

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const termChanged = term !== initialTerm
    const yearChanged = year !== initialYear

    if (!termChanged && !yearChanged) {
      toast.info('No changes to save')
      return
    }

    if (yearChanged) {
      const initialStart = parseYearStart(initialYear)
      const newStart = parseYearStart(year)
      const isBackward = newStart != null && initialStart != null && newStart < initialStart

      if (isBackward) {
        // Backward switch is allowed ONLY if the target year exists in the
        // archive registry. Otherwise reject — promotion only goes forward.
        if (!knownYears.includes(year)) {
          setError(
            `Cannot switch to ${year}: no records exist for that year. The promotion wizard only moves forward; backward switches require the target year to already have data.`,
          )
          return
        }
        setShowBackwardSwitchModal(true)
        return
      }

      setShowYearModal(true)
      return
    }
    if (termChanged) {
      setShowTermModal(true)
      return
    }
  }

  /** Backward switch — year already has records. Just flip the active year. */
  function commitBackwardSwitch() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('current_term', term)
      fd.set('current_academic_year', year)
      const result = await updateSchoolSettingsAction(fd)
      if ('error' in result) {
        setError(result.error)
        setShowBackwardSwitchModal(false)
        return
      }
      toast.success(`Switched active year to ${year}. Use the year picker on each admin page to browse — past-year data is view-only.`)
      setShowBackwardSwitchModal(false)
      router.refresh()
    })
  }

  /** Term-only save path. Optionally copies staffing from the old term. */
  function commitTermChange(copyStaffing: boolean) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('current_term', term)
      fd.set('current_academic_year', year)
      const result = await updateSchoolSettingsAction(fd)
      if ('error' in result) {
        setError(result.error)
        setShowTermModal(false)
        return
      }
      if (copyStaffing) {
        const copyResult = await copyTermAssignmentsAction({
          fromTerm: initialTerm,
          toTerm: term,
          academicYear: year,
        })
        if ('error' in copyResult) {
          toast.error(copyResult.error)
        } else {
          const total = copyResult.copiedSubject + copyResult.copiedClassTeacher
          toast.success(
            total > 0
              ? `Term updated · ${copyResult.copiedSubject} subject and ${copyResult.copiedClassTeacher} class-teacher assignments copied`
              : `Term updated · nothing to copy (no prior assignments for ${initialTerm})`,
          )
        }
      } else {
        toast.success(`Term changed to ${term}. Staffing for ${term} starts empty.`)
      }
      setShowTermModal(false)
      router.refresh()
    })
  }

  /** Year-change save path. Routes to the wizard, which commits the year on apply. */
  function commitYearChange() {
    const params = new URLSearchParams({
      newYear: year,
      ...(term !== initialTerm ? { newTerm: term } : {}),
    })
    setShowYearModal(false)
    router.push(`/admin/year-rollover?${params.toString()}`)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="current_term" className="label">Current term</label>
            <select
              id="current_term"
              name="current_term"
              value={term}
              onChange={(e) => setTerm(e.target.value as Term)}
              className="input mt-1"
            >
              {TERMS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <p className="text-xs text-ink-subtle mt-1">
              Changing the term will offer to copy teacher staffing forward.
            </p>
          </div>

          <div>
            <label htmlFor="current_academic_year" className="label">Academic year</label>
            <input
              id="current_academic_year"
              name="current_academic_year"
              type="text"
              inputMode="numeric"
              placeholder="2025/2026"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="input mt-1 font-mono"
            />
            <p className="text-xs text-ink-subtle mt-1">
              Changing the year opens the promotion wizard.
            </p>
          </div>
        </div>

        {lastUpdatedAt && (
          <p className="text-xs text-ink-subtle inline-flex items-center gap-1.5">
            <CalendarDays className="w-3 h-3" />
            Last updated {new Date(lastUpdatedAt).toLocaleString()}
            {lastUpdatedBy && <> by <span className="font-medium text-ink">{lastUpdatedBy}</span></>}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-surface-border">
          <button
            type="submit"
            disabled={pending || !dirty}
            className="btn-brand disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4" /> Save changes</>}
          </button>
          {dirty && !pending && (
            <button
              type="button"
              onClick={() => { setTerm(initialTerm); setYear(initialYear); setError(null) }}
              className="text-sm text-ink-muted hover:text-ink cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </form>

      {/* Term-change modal: ask to carry staffing */}
      <Dialog open={showTermModal} onOpenChange={setShowTermModal}>
        <DialogContent showClose={!pending}>
          <DialogTitle>Carry staffing from {initialTerm} to {term}?</DialogTitle>
          <DialogDescription className="mt-2 space-y-2 block">
            Subject teacher assignments and class teacher assignments can be copied over so
            the same teachers stay attached to the same classes for {term} &middot; {year}.
            Grades are always per-term and start fresh either way.
          </DialogDescription>
          <DialogFooter>
            <DialogClose className="btn-oauth" disabled={pending}>Cancel</DialogClose>
            <button
              type="button"
              onClick={() => commitTermChange(false)}
              disabled={pending}
              className="btn-oauth inline-flex items-center gap-1.5"
            >
              <SkipForward className="w-4 h-4" /> Skip &mdash; start empty
            </button>
            <button
              type="button"
              onClick={() => commitTermChange(true)}
              disabled={pending}
              className="btn-brand inline-flex items-center gap-1.5"
            >
              {pending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Copy className="w-4 h-4" /> Copy &amp; save</>}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backward-switch modal: target year already has records → just flip */}
      <Dialog open={showBackwardSwitchModal} onOpenChange={setShowBackwardSwitchModal}>
        <DialogContent showClose={!pending}>
          <DialogTitle>Switch active year to {year}?</DialogTitle>
          <DialogDescription className="mt-2 space-y-2 block">
            {year} already has records, so no promotion is needed &mdash; we just
            switch the school&apos;s active year. Admin pages will show that
            year&apos;s data in <span className="font-semibold">view-only</span>
            mode (no edits, no new grades). Switch back to {initialYear} the
            same way when you&apos;re done browsing.
          </DialogDescription>
          <DialogFooter>
            <DialogClose className="btn-oauth" disabled={pending}>Cancel</DialogClose>
            <button
              type="button"
              onClick={commitBackwardSwitch}
              disabled={pending}
              className="btn-brand inline-flex items-center gap-1.5"
            >
              {pending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Switching…</>
                : <>Switch to {year} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Year-change modal: route to promotion wizard */}
      <Dialog open={showYearModal} onOpenChange={setShowYearModal}>
        <DialogContent showClose={!pending}>
          <DialogTitle>Roll over to academic year {year}?</DialogTitle>
          <DialogDescription className="mt-2 space-y-2 block">
            A year rollover is a fresh start: subject and class-teacher
            assignments do not carry into the new year, and students need to
            be promoted to their next class. The next screen lists every
            active student with a suggested promotion. The year change only
            takes effect once you apply the wizard.
          </DialogDescription>
          <DialogFooter>
            <DialogClose className="btn-oauth" disabled={pending}>Cancel</DialogClose>
            <button
              type="button"
              onClick={commitYearChange}
              disabled={pending}
              className="btn-brand inline-flex items-center gap-1.5"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
