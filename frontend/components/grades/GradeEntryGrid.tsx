'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Loader2, AlertCircle, Keyboard, Sparkles, X, Search as SearchIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  validateScore,
  computeStudentRow,
  gradeLetterClasses,
} from '@/lib/grade-utils'
import {
  upsertGradeAction,
  bulkUpsertGradesAction,
} from '@/app/(app)/grades/[classId]/[subjectId]/actions'
import type { ScoreComponent, StudentGradeRow } from '@/types'
import Lottie from '@/components/ui/Lottie'

interface Props {
  rows: StudentGradeRow[]
  components: ScoreComponent[]
  classId: string
  subjectId: string
  term: string
  academicYear: string
}

type CellKey = `${string}:${string}` // `${studentId}:${componentId}`

function cellKey(studentId: string, componentId: string): CellKey {
  return `${studentId}:${componentId}` as CellKey
}

export default function GradeEntryGrid({
  rows: initialRows,
  components,
  classId,
  subjectId,
  term,
  academicYear,
}: Props) {
  const totalMaxScore = useMemo(
    () => components.reduce((s, c) => s + c.max_score, 0),
    [components],
  )

  const [scores, setScores] = useState<Record<CellKey, string>>(() => {
    const initial: Record<CellKey, string> = {}
    for (const row of initialRows) {
      for (const comp of components) {
        const v = row.scores[comp.id]
        if (v !== null && v !== undefined) initial[cellKey(row.student.id, comp.id)] = String(v)
      }
    }
    return initial
  })

  const [saving, setSaving] = useState<Record<CellKey, boolean>>({})
  const [errors, setErrors] = useState<Record<CellKey, string>>({})
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [celebrated, setCelebrated] = useState(false)
  const [celebrating, setCelebrating] = useState(false)

  const inputRefs = useRef<Record<CellKey, HTMLInputElement | null>>({})

  const computedRows: StudentGradeRow[] = initialRows.map((row) => {
    const fakeGrades = components.map((comp) => {
      const v = scores[cellKey(row.student.id, comp.id)]
      const num = v !== undefined && v !== '' ? parseFloat(v) : null
      return {
        id: '',
        student_id: row.student.id,
        subject_id: subjectId,
        class_id: classId,
        component_id: comp.id,
        score: Number.isFinite(num as number) ? (num as number) : null,
        term,
        academic_year: academicYear,
        entered_by: null,
        created_at: '',
        updated_at: '',
      }
    })
    return computeStudentRow(row.student, fakeGrades, components)
  })

  const completedRows = computedRows.filter((r) => r.isComplete).length
  const totalRows = computedRows.length
  const completionPct = totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0
  const allDone = totalRows > 0 && completedRows === totalRows

  // Search filter — scoped to students in THIS class+subject roster. Empty
  // query shows everything; matches case + diacritic insensitive against
  // full_name and student_number.
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  const visibleRows = useMemo(() => {
    if (!normalizedQuery) return computedRows
    return computedRows.filter((r) => {
      const name = r.student.full_name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      if (name.includes(normalizedQuery)) return true
      const num = (r.student.student_number ?? '').toLowerCase()
      if (num.includes(normalizedQuery)) return true
      return false
    })
  }, [computedRows, normalizedQuery])

  useEffect(() => {
    if (allDone && !celebrated) {
      setCelebrated(true)
      setCelebrating(true)
      const t = setTimeout(() => setCelebrating(false), 3800)
      return () => clearTimeout(t)
    }
  }, [allDone, celebrated])

  const saveCell = useCallback(
    async (studentId: string, componentId: string, value: string) => {
      const key = cellKey(studentId, componentId)
      const comp = components.find((c) => c.id === componentId)
      if (!comp) return

      const { valid, score, error } = validateScore(value, comp.max_score)
      if (!valid) {
        setErrors((e) => ({ ...e, [key]: error ?? 'Invalid' }))
        return
      }
      setErrors((e) => { const n = { ...e }; delete n[key]; return n })

      setSaving((s) => ({ ...s, [key]: true }))
      try {
        const result = await upsertGradeAction(
          studentId, subjectId, classId, componentId, score, term, academicYear,
        )
        if (result.error) {
          setErrors((e) => ({ ...e, [key]: result.error! }))
          toast.error(result.error)
        }
      } finally {
        setSaving((s) => { const n = { ...s }; delete n[key]; return n })
      }
    },
    [components, subjectId, classId, term, academicYear],
  )

  function handleChange(studentId: string, componentId: string, value: string) {
    const key = cellKey(studentId, componentId)
    setScores((s) => ({ ...s, [key]: value }))

    if (value === '') {
      setErrors((e) => { const n = { ...e }; delete n[key]; return n })
      return
    }
    const comp = components.find((c) => c.id === componentId)
    if (comp) {
      const { valid, error } = validateScore(value, comp.max_score)
      if (!valid) setErrors((e) => ({ ...e, [key]: error ?? 'Invalid' }))
      else setErrors((e) => { const n = { ...e }; delete n[key]; return n })
    }
  }

  function focusCell(rowIdx: number, compIdx: number) {
    const r = initialRows[rowIdx]
    const c = components[compIdx]
    if (!r || !c) return
    inputRefs.current[cellKey(r.student.id, c.id)]?.focus()
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    compIdx: number,
  ) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const next = (rowIdx + 1) % initialRows.length
      focusCell(next, compIdx)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusCell(Math.min(rowIdx + 1, initialRows.length - 1), compIdx)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusCell(Math.max(rowIdx - 1, 0), compIdx)
    } else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      e.preventDefault()
      focusCell(rowIdx, Math.min(compIdx + 1, components.length - 1))
    } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
      e.preventDefault()
      focusCell(rowIdx, Math.max(compIdx - 1, 0))
    }
  }

  async function handlePaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIdx: number,
    componentId: string,
  ) {
    const text = e.clipboardData.getData('text')
    const parts = text.split(/[\r\n\t]+/).map((s) => s.trim()).filter((s) => s !== '')
    if (parts.length <= 1) return // let the default single-value paste happen

    e.preventDefault()
    const comp = components.find((c) => c.id === componentId)
    if (!comp) return

    const toApply = parts.slice(0, initialRows.length - rowIdx)
    const updates: Array<{ studentId: string; componentId: string; score: number | null }> = []
    const nextScores = { ...scores }
    const nextErrors: Record<CellKey, string> = {}

    for (let i = 0; i < toApply.length; i++) {
      const r = initialRows[rowIdx + i]
      const { valid, score, error } = validateScore(toApply[i], comp.max_score)
      const key = cellKey(r.student.id, componentId)
      nextScores[key] = toApply[i]
      if (!valid) {
        nextErrors[key] = error ?? 'Invalid'
      } else {
        updates.push({ studentId: r.student.id, componentId, score })
      }
    }
    setScores(nextScores)
    setErrors((prev) => ({ ...prev, ...nextErrors }))

    if (updates.length === 0) {
      toast.error('No valid scores to paste.')
      return
    }

    const savingKeys = updates.map((u) => cellKey(u.studentId, u.componentId))
    setSaving((s) => {
      const n = { ...s }
      for (const k of savingKeys) n[k] = true
      return n
    })

    const result = await bulkUpsertGradesAction(
      updates.map((u) => ({ ...u, subjectId, classId })),
      term, academicYear,
    )

    setSaving((s) => {
      const n = { ...s }
      for (const k of savingKeys) delete n[k]
      return n
    })

    if (result.error) toast.error(result.error)
    else toast.success(`Pasted ${result.saved} score${result.saved === 1 ? '' : 's'}.`)
  }

  return (
    <div className="pb-32 sm:pb-28">
      <div className="bg-brand-secondary-light/50 border-y border-brand-secondary/30 px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs gap-2">
        <p className="text-brand-accent-dark">
          <span className="font-semibold">Auto-saves</span> as you tab between fields. Paste a column from a spreadsheet to bulk-fill.
        </p>
        <button
          type="button"
          onClick={() => setShowShortcuts(true)}
          className="inline-flex items-center gap-1 font-medium text-brand-primary-dark hover:text-brand-primary cursor-pointer flex-shrink-0"
        >
          <Keyboard className="w-3.5 h-3.5" /> Shortcuts
        </button>
      </div>

      {/* Search — scoped to students in this class+subject roster */}
      <div className="px-4 sm:px-6 pt-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${totalRows} student${totalRows === 1 ? '' : 's'} by name or #…`}
            className="input pl-9 pr-9"
            aria-label="Search students in this class"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded text-ink-subtle hover:text-ink cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {query && visibleRows.length !== totalRows && (
          <p className="text-[11px] text-ink-subtle mt-1.5">
            {visibleRows.length} of {totalRows} match &ldquo;{query}&rdquo;
          </p>
        )}
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-3">
        {/* ── Desktop matrix table — sm+ ────────────────────────────────── */}
        {visibleRows.length > 0 && (
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface-muted px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-subtle border-b border-surface-border w-12">#</th>
                    <th className="sticky left-12 z-10 bg-surface-muted px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-subtle border-b border-surface-border min-w-[12rem]">Student</th>
                    {components.map((comp) => (
                      <th
                        key={comp.id}
                        className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-brand-accent border-b border-surface-border whitespace-nowrap"
                      >
                        {comp.name} <span className="text-ink-subtle/70 font-mono normal-case">/{comp.max_score}</span>
                      </th>
                    ))}
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-ink-subtle border-b border-surface-border whitespace-nowrap">
                      Total <span className="text-ink-subtle/70 font-mono normal-case">/{totalMaxScore}</span>
                    </th>
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-ink-subtle border-b border-surface-border w-16">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, rowIdx) => (
                    <tr key={row.student.id} className="even:bg-surface-muted/30 hover:bg-brand-primary-light/20 transition-colors">
                      <td className="sticky left-0 z-10 bg-inherit px-3 py-2 text-[11px] font-mono text-ink-subtle text-right border-b border-surface-border w-12">
                        {rowIdx + 1}
                      </td>
                      <td className="sticky left-12 z-10 bg-inherit px-3 py-2 border-b border-surface-border min-w-[12rem] max-w-[16rem]">
                        <p className="text-sm font-semibold text-ink truncate">{row.student.full_name}</p>
                        {row.student.student_number && (
                          <p className="text-[11px] font-mono text-ink-subtle">#{row.student.student_number}</p>
                        )}
                      </td>
                      {components.map((comp, compIdx) => {
                        const key = cellKey(row.student.id, comp.id)
                        return (
                          <td key={comp.id} className="px-1 py-2 border-b border-surface-border align-middle">
                            <ScoreCell
                              cellId={key}
                              value={scores[key] ?? ''}
                              maxScore={comp.max_score}
                              ariaLabel={`${comp.name} for ${row.student.full_name}`}
                              saving={saving[key]}
                              error={errors[key]}
                              onChange={(v) => handleChange(row.student.id, comp.id, v)}
                              onBlur={() => handleBlurIfChanged(row.student.id, comp.id, scores[key] ?? '')}
                              onKeyDown={(e) => handleKeyDown(e, rowIdx, compIdx)}
                              onPaste={(e) => handlePaste(e, rowIdx, comp.id)}
                              registerRef={(el) => { inputRefs.current[key] = el }}
                              compact
                            />
                          </td>
                        )
                      })}
                      <td className="px-2 py-2 text-center border-b border-surface-border">
                        <span
                          className={
                            'inline-flex items-center justify-center min-w-[3.5rem] h-8 px-2 rounded text-xs font-bold font-mono tabular-nums border ' +
                            (row.isComplete
                              ? 'border-brand-secondary/40 bg-brand-secondary-light text-brand-accent-dark'
                              : 'border-dashed border-surface-border bg-surface-muted text-ink-subtle')
                          }
                        >
                          {row.isComplete ? `${row.total.toFixed(0)} · ${row.percentage}%` : '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center border-b border-surface-border">
                        {row.isComplete ? (
                          <span className={'inline-flex items-center justify-center min-w-[2.25rem] h-7 px-2 rounded text-xs font-bold border ' + gradeLetterClasses(row.gradeLetter)}>
                            {row.gradeLetter}
                          </span>
                        ) : (
                          <span aria-hidden="true" className="inline-block w-9 h-7 rounded border border-dashed border-surface-border" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Mobile card stack — < sm ──────────────────────────────────── */}
        <div className="sm:hidden space-y-3">
          {visibleRows.map((row, rowIdx) => {
            const filled = components.filter((c) => row.scores[c.id] !== null).length
            const pct = (filled / components.length) * 100
            return (
              <div
                key={row.student.id}
                className={
                  'card overflow-hidden transition-shadow ' +
                  (row.isComplete ? 'ring-1 ring-brand-secondary/40' : '')
                }
              >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-muted/40">
                  <span className="w-6 text-[11px] font-mono text-ink-subtle text-right flex-shrink-0">{rowIdx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{row.student.full_name}</p>
                    {row.student.student_number && (
                      <p className="text-[11px] font-mono text-ink-subtle mt-0.5">#{row.student.student_number}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider">{filled}/{components.length}</span>
                    <div className="w-10 h-1.5 bg-surface-border rounded-full overflow-hidden">
                      <div
                        className={'h-full rounded-full ' + (row.isComplete ? 'bg-brand-secondary' : 'bg-brand-primary')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {row.isComplete ? (
                      <span className={'inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded text-xs font-bold border ' + gradeLetterClasses(row.gradeLetter)}>
                        {row.gradeLetter}
                      </span>
                    ) : (
                      <span aria-hidden="true" className="inline-block w-10 h-7 rounded border border-dashed border-surface-border" />
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 grid grid-cols-2 gap-3">
                  {components.map((comp, compIdx) => {
                    const key = cellKey(row.student.id, comp.id)
                    return (
                      <div key={comp.id}>
                        <label htmlFor={key} className="block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle mb-1">
                          {comp.name} <span className="text-ink-subtle/70 font-mono">/{comp.max_score}</span>
                        </label>
                        <ScoreCell
                          cellId={key}
                          value={scores[key] ?? ''}
                          maxScore={comp.max_score}
                          ariaLabel={`${comp.name} for ${row.student.full_name}`}
                          saving={saving[key]}
                          error={errors[key]}
                          onChange={(v) => handleChange(row.student.id, comp.id, v)}
                          onBlur={() => handleBlurIfChanged(row.student.id, comp.id, scores[key] ?? '')}
                          onKeyDown={(e) => handleKeyDown(e, rowIdx, compIdx)}
                          onPaste={(e) => handlePaste(e, rowIdx, comp.id)}
                          registerRef={(el) => { inputRefs.current[key] = el }}
                        />
                      </div>
                    )
                  })}

                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle mb-1">
                      Total <span className="text-ink-subtle/70 font-mono">/{totalMaxScore}</span>
                    </p>
                    <div
                      className={
                        'min-h-touch px-3 py-2 rounded-lg border text-sm text-center font-mono font-bold tabular-nums ' +
                        (row.isComplete
                          ? 'border-brand-secondary/40 bg-brand-secondary-light text-brand-accent-dark'
                          : 'border-dashed border-surface-border bg-surface-muted text-ink-subtle')
                      }
                    >
                      {row.isComplete ? `${row.total.toFixed(0)} · ${row.percentage}%` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {computedRows.length === 0 && (
          <p className="text-center text-ink-muted text-sm py-10">No students enrolled in this subject yet.</p>
        )}
        {computedRows.length > 0 && visibleRows.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm font-medium text-ink">No students match &ldquo;{query}&rdquo;</p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs text-brand-primary hover:text-brand-primary-dark cursor-pointer mt-1"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-surface-border">
        <span aria-hidden="true" className="block h-0.5 bg-gradient-to-r from-brand-accent via-brand-primary to-brand-secondary" />
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-3 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-ink">
                {completedRows} of {totalRows} complete
              </p>
              <span className="text-xs font-mono text-ink-muted">· {completionPct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 bg-surface-border rounded-full overflow-hidden">
              <div
                className={
                  'h-full rounded-full transition-all duration-500 ' +
                  (allDone ? 'bg-gradient-to-r from-brand-secondary to-brand-secondary-dark' : 'bg-gradient-to-r from-brand-primary to-brand-primary-dark')
                }
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium flex-shrink-0">
            {allDone ? (
              <span className="inline-flex items-center gap-1 text-brand-secondary-dark">
                <Sparkles className="w-4 h-4" /> Class complete
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-brand-primary">
                <CheckCircle2 className="w-4 h-4" /> Auto-save on
              </span>
            )}
          </div>
        </div>
      </div>

      {celebrating && (
        <div aria-hidden="true" className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <Lottie src="/lottie/celebrate-confetti.json" loop={false} className="w-full max-w-2xl h-auto" />
        </div>
      )}

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowShortcuts(false)}>
          <div className="card max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-brand-primary" /> Keyboard shortcuts
              </h3>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-2 text-xs">
              <ShortcutRow keys={['Enter']} text="Next student, same component" />
              <ShortcutRow keys={['Tab']} text="Next component, same row" />
              <ShortcutRow keys={['Shift', 'Tab']} text="Previous field" />
              <ShortcutRow keys={['↑', '↓']} text="Move up / down a column" />
              <ShortcutRow keys={['←', '→']} text="Move across columns (at field edge)" />
              <ShortcutRow keys={['Ctrl', 'V']} text="Paste a column from a spreadsheet" />
            </ul>
          </div>
        </div>
      )}
    </div>
  )

  function handleBlurIfChanged(studentId: string, componentId: string, value: string) {
    const original = initialRows.find((r) => r.student.id === studentId)?.scores[componentId]
    const num = value === '' ? null : parseFloat(value)
    const same = (original === null || original === undefined) ? (num === null) : original === num
    if (same) return
    saveCell(studentId, componentId, value)
  }
}

// Shared numeric-input cell used by both the desktop matrix table and the
// mobile card stack. `compact` shrinks padding for tight grid rows.
interface ScoreCellProps {
  cellId: string
  value: string
  maxScore: number
  ariaLabel: string
  saving?: boolean
  error?: string
  compact?: boolean
  onChange: (value: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void
  registerRef: (el: HTMLInputElement | null) => void
}

function ScoreCell({
  cellId, value, maxScore, ariaLabel, saving, error, compact,
  onChange, onBlur, onKeyDown, onPaste, registerRef,
}: ScoreCellProps) {
  return (
    <div className="relative">
      <input
        id={cellId}
        ref={registerRef}
        type="number"
        inputMode="numeric"
        enterKeyHint="next"
        min={0}
        max={maxScore}
        step="1"
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        aria-label={ariaLabel}
        className={
          'w-full rounded-lg border text-sm text-center font-mono font-semibold tabular-nums ' +
          'focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent ' +
          'transition-all duration-150 ' +
          (compact
            ? 'h-10 px-2 py-1.5 '
            : 'min-h-touch px-3 py-2 ') +
          (error
            ? 'border-red-400 bg-red-50 text-red-700'
            : 'border-surface-border bg-white text-ink hover:border-brand-primary/40')
        }
      />
      {saving && (
        <div className="absolute inset-y-0 right-1.5 flex items-center pointer-events-none">
          <Loader2 className="w-3 h-3 animate-spin text-brand-primary" />
        </div>
      )}
      {error && !compact && (
        <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" /> {error}
        </p>
      )}
      {error && compact && (
        <p title={error} className="text-[10px] text-red-600 mt-0.5 text-center truncate flex items-center justify-center gap-0.5">
          <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}

function ShortcutRow({ keys, text }: { keys: string[]; text: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{text}</span>
      <span className="flex items-center gap-1 flex-shrink-0">
        {keys.map((k, i) => (
          <kbd key={i} className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded border border-surface-border bg-surface-muted text-[10px] font-mono font-semibold text-ink">
            {k}
          </kbd>
        ))}
      </span>
    </li>
  )
}
