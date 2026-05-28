'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight, Loader2, CheckCircle2, AlertTriangle, GraduationCap,
  RotateCw, Search as SearchIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import SearchInput from '@/components/ui/SearchInput'
import {
  applyYearRolloverAction,
  type PromotionAction,
  type PromotionMove,
} from '../settings/actions'
import { nextLevel } from '@/lib/promotion'

export interface ClassRow {
  id: string
  name: string
  level: string
  arm: string
}

export interface StudentRow {
  id: string
  fullName: string
  studentNumber: string | null
  currentClassId: string
  currentClassName: string
  currentLevel: string
  currentArm: string
}

interface Props {
  students: StudentRow[]
  classes: ClassRow[]
  currentYear: string
  newYear: string
}

interface RowState {
  action: PromotionAction
  toClassId: string | null
}

/**
 * Given a student's current class (level + arm) plus the catalogue of all
 * classes, suggests the default move. JSS 1A → JSS 2A; SS 3A → graduate. If
 * the matching next-level class with the same arm doesn't exist, falls back
 * to any next-level class (admin can override). If nothing matches, marks
 * unknown and the row needs manual pick.
 */
function suggestDefault(student: StudentRow, classes: ClassRow[]):
  | { action: 'promote'; toClassId: string }
  | { action: 'graduate' }
  | { action: 'leave' } {
  const next = nextLevel(student.currentLevel)
  if (next.kind === 'graduate') return { action: 'graduate' }
  if (next.kind === 'unknown') return { action: 'leave' }
  const sameArm = classes.find(
    (c) => c.level === next.nextLevel && c.arm === student.currentArm,
  )
  if (sameArm) return { action: 'promote', toClassId: sameArm.id }
  const anyArm = classes.find((c) => c.level === next.nextLevel)
  if (anyArm) return { action: 'promote', toClassId: anyArm.id }
  return { action: 'leave' }
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

export default function RolloverWizard({ students, classes, currentYear, newYear }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState('')

  const initialState = useMemo(() => {
    const map: Record<string, RowState> = {}
    for (const s of students) {
      const sug = suggestDefault(s, classes)
      map[s.id] = {
        action: sug.action,
        toClassId: sug.action === 'promote' ? sug.toClassId : null,
      }
    }
    return map
  }, [students, classes])

  const [decisions, setDecisions] = useState<Record<string, RowState>>(initialState)

  function setAction(studentId: string, action: PromotionAction) {
    setDecisions((d) => {
      const prev = d[studentId]
      const next: RowState = { ...prev, action }
      if (action !== 'promote') next.toClassId = null
      // If the admin flips back to "promote" but had cleared the target, suggest one.
      if (action === 'promote' && !prev.toClassId) {
        const student = students.find((s) => s.id === studentId)
        if (student) {
          const sug = suggestDefault(student, classes)
          if (sug.action === 'promote') next.toClassId = sug.toClassId
        }
      }
      return { ...d, [studentId]: next }
    })
  }

  function setTarget(studentId: string, toClassId: string) {
    setDecisions((d) => ({ ...d, [studentId]: { ...d[studentId], toClassId } }))
  }

  function resetAll() {
    setDecisions(initialState)
  }

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return students
    return students.filter((s) =>
      normalize(s.fullName).includes(q) ||
      normalize(s.currentClassName).includes(q) ||
      (s.studentNumber && normalize(s.studentNumber).includes(q)),
    )
  }, [students, query])

  // Roll students up per current class for a tidier UI.
  const groups = useMemo(() => {
    const map = new Map<string, { className: string; level: string; arm: string; students: StudentRow[] }>()
    for (const s of filtered) {
      const key = s.currentClassId
      const g = map.get(key)
      if (g) g.students.push(s)
      else map.set(key, {
        className: s.currentClassName,
        level: s.currentLevel,
        arm: s.currentArm,
        students: [s],
      })
    }
    return Array.from(map.values()).sort((a, b) => a.className.localeCompare(b.className))
  }, [filtered])

  // Summary across ALL students (not just filtered) — counts for the action bar.
  const summary = useMemo(() => {
    const c = { promote: 0, repeat: 0, graduate: 0, leave: 0, unmatched: 0 }
    for (const s of students) {
      const d = decisions[s.id]
      if (!d) continue
      c[d.action] += 1
      if (d.action === 'promote' && !d.toClassId) c.unmatched += 1
    }
    return c
  }, [students, decisions])

  const canApply = summary.unmatched === 0

  function apply() {
    if (!canApply) {
      toast.error(`${summary.unmatched} student(s) marked for promotion but no target class chosen.`)
      return
    }
    const moves: PromotionMove[] = students.map((s) => ({
      studentId: s.id,
      action: decisions[s.id].action,
      toClassId: decisions[s.id].toClassId ?? undefined,
    }))
    startTransition(async () => {
      const result = await applyYearRolloverAction({ newYear, moves })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      const bits = [
        result.promoted && `${result.promoted} promoted`,
        result.repeated && `${result.repeated} repeated`,
        result.graduated && `${result.graduated} graduated`,
        result.left && `${result.left} left as-is`,
      ].filter(Boolean).join(', ')
      if (result.failed.length === 0) {
        toast.success(`Year rolled over to ${newYear} · ${bits}`)
      } else {
        toast.warning(`Rolled over with ${result.failed.length} failure(s). Check details and re-run.`)
      }
      router.push('/admin/settings')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Sticky summary + apply bar */}
      <div className="sticky top-[68px] z-20 -mx-3 sm:mx-0">
        <div className="card flex items-center gap-3 px-4 py-3 shadow-md ring-1 ring-brand-primary/30 bg-brand-primary-light/40">
          <div className="text-xs text-ink flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold">{students.length} students</span>
            <span>&middot;</span>
            <span><span className="font-semibold text-brand-primary-dark">{summary.promote}</span> promote</span>
            <span><span className="font-semibold text-ink">{summary.repeat}</span> repeat</span>
            <span><span className="font-semibold text-ink">{summary.graduate}</span> graduate</span>
            <span><span className="font-semibold text-ink">{summary.leave}</span> leave</span>
            {summary.unmatched > 0 && (
              <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {summary.unmatched} need target class
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={resetAll}
            disabled={pending}
            className="text-xs text-ink-muted hover:text-ink cursor-pointer inline-flex items-center gap-1"
          >
            <RotateCw className="w-3 h-3" /> Reset
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={pending || !canApply}
            className="btn-brand btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Applying…</>
              : <>Apply rollover <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search by name, student number, or class…"
        aria-label="Search students"
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
          <SearchIcon className="w-7 h-7 mx-auto text-brand-accent/60" />
          <p className="text-sm font-medium text-ink mt-2">No students match &ldquo;{query}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <details key={g.className} open className="card overflow-hidden">
              <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-center gap-3 px-4 py-3 bg-surface-muted border-b border-surface-border">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-accent/10 text-brand-accent flex-shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink font-mono">{g.className}</p>
                  <p className="text-[11px] text-ink-muted">{g.students.length} student{g.students.length === 1 ? '' : 's'}</p>
                </div>
                <NextLevelHint level={g.level} />
              </summary>
              <ul className="divide-y divide-surface-border">
                {g.students.map((s) => {
                  const d = decisions[s.id]
                  return (
                    <li key={s.id} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{s.fullName}</p>
                        <p className="text-[11px] text-ink-subtle font-mono">{s.studentNumber ?? '—'}</p>
                      </div>

                      <ActionSelect
                        value={d.action}
                        onChange={(a) => setAction(s.id, a)}
                        disabled={pending}
                      />

                      {d.action === 'promote' ? (
                        <ClassSelect
                          value={d.toClassId ?? ''}
                          classes={classes}
                          currentClassId={s.currentClassId}
                          onChange={(v) => setTarget(s.id, v)}
                          disabled={pending}
                          highlightMissing={!d.toClassId}
                        />
                      ) : (
                        <span className="text-[11px] text-ink-subtle sm:text-right">
                          {d.action === 'graduate' && <>marks <span className="font-semibold text-ink">inactive</span></>}
                          {d.action === 'repeat' && <>stays in <span className="font-mono text-ink">{s.currentClassName}</span></>}
                          {d.action === 'leave' && <>no change</>}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </details>
          ))}
        </div>
      )}

      <div className="rounded-lg bg-surface-muted/60 border border-surface-border px-4 py-3 text-xs text-ink-muted flex items-start gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-brand-primary" />
        <span>
          Applying the rollover updates each student&apos;s class, deactivates graduates, and switches the school&apos;s academic year to{' '}
          <span className="font-mono font-semibold text-ink">{newYear}</span>. The wizard can be revisited if you need to adjust later &mdash; previous-year data stays intact.
          Currently on <span className="font-mono">{currentYear}</span>.
        </span>
      </div>
    </div>
  )
}

function NextLevelHint({ level }: { level: string }) {
  const next = nextLevel(level)
  if (next.kind === 'graduate') {
    return <span className="text-[10px] uppercase tracking-wider font-semibold bg-brand-secondary-light text-brand-secondary-dark px-2 py-0.5 rounded">graduating year</span>
  }
  if (next.kind === 'level') {
    return <span className="text-[10px] uppercase tracking-wider font-semibold bg-brand-accent/10 text-brand-accent px-2 py-0.5 rounded">→ {next.nextLevel}</span>
  }
  return null
}

const ACTION_LABELS: Record<PromotionAction, string> = {
  promote: 'Promote',
  repeat: 'Repeat',
  graduate: 'Graduate',
  leave: 'Leave as-is',
}

function ActionSelect({
  value, onChange, disabled,
}: {
  value: PromotionAction
  onChange: (v: PromotionAction) => void
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PromotionAction)}
      disabled={disabled}
      className={cn(
        'input text-sm w-full sm:w-32',
        value === 'graduate' && 'border-brand-secondary/40 bg-brand-secondary-light/40',
        value === 'repeat' && 'border-amber-300 bg-amber-50',
        value === 'leave' && 'text-ink-muted',
      )}
    >
      {(Object.entries(ACTION_LABELS) as [PromotionAction, string][]).map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  )
}

function ClassSelect({
  value, classes, currentClassId, onChange, disabled, highlightMissing,
}: {
  value: string
  classes: ClassRow[]
  currentClassId: string
  onChange: (v: string) => void
  disabled?: boolean
  highlightMissing?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'input text-sm w-full sm:w-44 font-mono',
        highlightMissing && 'border-red-400 bg-red-50/40',
      )}
    >
      <option value="">— pick class —</option>
      {classes
        .filter((c) => c.id !== currentClassId)
        .map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
    </select>
  )
}
