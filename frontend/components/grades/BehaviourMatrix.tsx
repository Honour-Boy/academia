'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Smile, Loader2, CheckCircle2 } from 'lucide-react'
import type { Student } from '@/types'
import type { BehaviourActivityRow } from '@/lib/behaviour'
import { SCORE_KEYS, isValidScore } from '@/lib/behaviour'
import { upsertBehaviourScoreAction } from '@/app/(app)/class-teacher/[classId]/actions'

interface Props {
  students: Student[]
  activities: BehaviourActivityRow[]
  /** Map<studentId, Record<activityId, score>>. Missing entries = no row in DB. */
  initialScores: Record<string, Record<string, number>>
  term: string
  academicYear: string
}

type CellKey = `${string}:${string}`

function cellKey(studentId: string, activityId: string): CellKey {
  return `${studentId}:${activityId}` as CellKey
}

/**
 * Per-class behaviour scoring matrix. Rows = students, columns = activities.
 * Each cell is a 1–5 dropdown. Auto-saves on change; pending state shown via
 * a small spinner that overlays the select.
 */
export default function BehaviourMatrix({
  students, activities, initialScores, term, academicYear,
}: Props) {
  const [scores, setScores] = useState<Record<CellKey, number | null>>(() => {
    const init: Record<CellKey, number | null> = {}
    for (const s of students) {
      const row = initialScores[s.id]
      if (!row) continue
      for (const [aid, val] of Object.entries(row)) {
        init[cellKey(s.id, aid)] = val
      }
    }
    return init
  })
  const [saving, setSaving] = useState<Record<CellKey, boolean>>({})
  const [errors, setErrors] = useState<Record<CellKey, string>>({})

  const classId = useMemo(() => {
    // students all share class_id; we accept the first one. The action's
    // server-side check also enforces this.
    return students[0]?.class_id ?? ''
  }, [students])

  // Per-row completion stats so the teacher can see at a glance who's done.
  const perStudentFilled = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of students) {
      let filled = 0
      for (const a of activities) {
        if (scores[cellKey(s.id, a.id)] !== undefined && scores[cellKey(s.id, a.id)] !== null) {
          filled += 1
        }
      }
      map.set(s.id, filled)
    }
    return map
  }, [students, activities, scores])

  // Per-activity column completion to help the teacher hunt for blanks.
  const perActivityFilled = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of activities) {
      let filled = 0
      for (const s of students) {
        if (scores[cellKey(s.id, a.id)] !== undefined && scores[cellKey(s.id, a.id)] !== null) {
          filled += 1
        }
      }
      map.set(a.id, filled)
    }
    return map
  }, [students, activities, scores])

  const totalCells = students.length * activities.length
  const filledCells = Array.from(perStudentFilled.values()).reduce((a, b) => a + b, 0)
  const pct = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0

  async function saveCell(studentId: string, activityId: string, raw: string) {
    const key = cellKey(studentId, activityId)
    const value: number | null = raw === '' ? null : Number(raw)
    if (value !== null && !isValidScore(value)) {
      setErrors((e) => ({ ...e, [key]: 'Pick a value from 1 to 5' }))
      return
    }
    setErrors((e) => { const n = { ...e }; delete n[key]; return n })

    // Optimistic update
    setScores((s) => ({ ...s, [key]: value }))
    setSaving((s) => ({ ...s, [key]: true }))
    try {
      const res = await upsertBehaviourScoreAction({
        classId,
        studentId,
        activityId,
        term,
        academicYear,
        score: value,
      })
      if ('error' in res) {
        toast.error(res.error)
        setErrors((e) => ({ ...e, [key]: res.error }))
        // Rollback to the previous value so the UI matches the DB state.
        setScores((s) => {
          const n = { ...s }
          const original = initialScores[studentId]?.[activityId] ?? null
          n[key] = original
          return n
        })
      }
    } finally {
      setSaving((s) => { const n = { ...s }; delete n[key]; return n })
    }
  }

  return (
    <section className="card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border bg-surface-muted flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex-shrink-0">
          <Smile className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink">Behaviour matrix</h3>
          <p className="text-[11px] text-ink-muted">
            1 = Poor · 2 = Weak · 3 = Fair · 4 = Good · 5 = Very Good. Auto-saves per cell.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-shrink-0">
          <div className="w-20 h-1.5 bg-surface-border/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-ink-muted whitespace-nowrap">{filledCells}/{totalCells}</span>
          {pct === 100 && <CheckCircle2 className="w-4 h-4 text-brand-secondary-dark" />}
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-muted">
              <th className="sticky left-0 z-10 bg-surface-muted px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-subtle border-b border-surface-border min-w-[10rem]">
                Student
              </th>
              {activities.map((a) => (
                <th
                  key={a.id}
                  className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-brand-accent border-b border-surface-border whitespace-nowrap min-w-[6.5rem]"
                  title={a.description ?? a.name}
                >
                  <p className="truncate max-w-[8rem]">{a.name}</p>
                  <span className="text-[9px] font-mono text-ink-subtle/70 normal-case">
                    {perActivityFilled.get(a.id) ?? 0}/{students.length}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s, rowIdx) => {
              const filled = perStudentFilled.get(s.id) ?? 0
              const complete = filled === activities.length && activities.length > 0
              return (
                <tr key={s.id} className={'border-b border-surface-border ' + (rowIdx % 2 === 0 ? 'bg-white' : 'bg-surface-muted/30')}>
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-2 border-r border-surface-border min-w-[10rem]">
                    <p className="text-sm font-semibold text-ink truncate">{s.full_name}</p>
                    <p className="text-[10px] text-ink-subtle font-mono mt-0.5">
                      {complete ? '✓ complete' : `${filled}/${activities.length}`}
                    </p>
                  </td>
                  {activities.map((a) => {
                    const key = cellKey(s.id, a.id)
                    const value = scores[key]
                    const isSaving = !!saving[key]
                    const err = errors[key]
                    return (
                      <td key={a.id} className="px-1 py-1 border-r border-surface-border align-middle">
                        <div className="relative">
                          <select
                            value={value ?? ''}
                            onChange={(e) => saveCell(s.id, a.id, e.target.value)}
                            disabled={isSaving}
                            aria-label={`${a.name} for ${s.full_name}`}
                            className={
                              'w-full h-9 px-1 rounded-md border bg-white text-sm font-mono font-semibold text-center cursor-pointer ' +
                              'focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent ' +
                              'transition-all duration-150 disabled:opacity-60 disabled:cursor-wait ' +
                              (err ? 'border-red-400 text-red-700 bg-red-50'
                                : value !== null && value !== undefined
                                  ? scoreClasses(value)
                                  : 'border-surface-border text-ink-subtle hover:border-brand-primary/40')
                            }
                          >
                            <option value="">—</option>
                            {[5, 4, 3, 2, 1].map((n) => (
                              <option key={n} value={n}>
                                {n} {SCORE_KEYS[n as 1 | 2 | 3 | 4 | 5]}
                              </option>
                            ))}
                          </select>
                          {isSaving && (
                            <div className="absolute inset-y-0 right-1 flex items-center pointer-events-none">
                              <Loader2 className="w-3 h-3 animate-spin text-brand-primary" />
                            </div>
                          )}
                        </div>
                        {err && (
                          <p title={err} className="text-[10px] text-red-600 mt-0.5 text-center truncate">{err}</p>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function scoreClasses(score: number): string {
  if (score >= 5) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (score >= 4) return 'border-blue-200 bg-blue-50 text-blue-700'
  if (score >= 3) return 'border-yellow-200 bg-yellow-50 text-yellow-700'
  if (score >= 2) return 'border-orange-200 bg-orange-50 text-orange-700'
  return 'border-red-200 bg-red-50 text-red-700'
}
