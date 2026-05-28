'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, Loader2, Save } from 'lucide-react'
import { TERMS, type Term } from '@/lib/grade-utils'
import { updateSchoolSettingsAction } from './actions'

interface Props {
  initialTerm: Term
  initialYear: string
  lastUpdatedAt: string | null
  lastUpdatedBy: string | null
}

export default function SettingsForm({
  initialTerm, initialYear, lastUpdatedAt, lastUpdatedBy,
}: Props) {
  const router = useRouter()
  const [term, setTerm] = useState<Term>(initialTerm)
  const [year, setYear] = useState(initialYear)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const dirty = term !== initialTerm || year !== initialYear

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateSchoolSettingsAction(fd)
      if ('error' in result) {
        setError(result.error)
        return
      }
      if (!result.changed.term && !result.changed.year) {
        toast.info('No changes to save')
        return
      }
      const bits: string[] = []
      if (result.changed.term) bits.push('term')
      if (result.changed.year) bits.push('academic year')
      toast.success(`Updated ${bits.join(' and ')}`)
      router.refresh()
    })
  }

  return (
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
            Drives every screen that shows grades, attendance, and assignments.
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
            Format <span className="font-mono">YYYY/YYYY</span> with consecutive years.
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
  )
}
