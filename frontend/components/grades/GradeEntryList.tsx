'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { ScoreComponent, StudentGradeRow } from '@/types'
import { validateScore, gradeLetterClasses, computeStudentRow } from '@/lib/grade-utils'
import { upsertGradeAction } from '@/app/(app)/grades/[classId]/[subjectId]/actions'
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  rows: StudentGradeRow[]
  components: ScoreComponent[]
  classId: string
  subjectId: string
  term: string
  academicYear: string
}

const DRAFT_KEY = (classId: string, subjectId: string, term: string, year: string) =>
  `grade-draft:${classId}:${subjectId}:${term}:${year}`

export default function GradeEntryList({
  rows: initialRows,
  components,
  classId,
  subjectId,
  term,
  academicYear,
}: Props) {
  const [activeComponent, setActiveComponent] = useState(components[0]?.id ?? '')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Local scores state — keyed by `studentId:componentId`
  const [localScores, setLocalScores] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const row of initialRows) {
      for (const comp of components) {
        const val = row.scores[comp.id]
        if (val !== null && val !== undefined) {
          initial[`${row.student.id}:${comp.id}`] = String(val)
        }
      }
    }
    return initial
  })

  // Draft persistence (offline support)
  const draftKey = DRAFT_KEY(classId, subjectId, term, academicYear)

  useEffect(() => {
    const saved = localStorage.getItem(draftKey)
    if (saved) {
      try {
        const draft = JSON.parse(saved) as Record<string, string>
        setLocalScores((prev) => ({ ...prev, ...draft }))
      } catch {}
    }
  }, [draftKey])

  const saveDraft = useCallback((scores: Record<string, string>) => {
    localStorage.setItem(draftKey, JSON.stringify(scores))
  }, [draftKey])

  // Computed rows from local state
  const computedRows = initialRows.map((row) => {
    const scores = { ...row.scores }
    for (const comp of components) {
      const key = `${row.student.id}:${comp.id}`
      const val = localScores[key]
      if (val !== undefined && val !== '') scores[comp.id] = parseFloat(val)
      else if (val === '') scores[comp.id] = null
    }
    return computeStudentRow(
      row.student,
      Object.entries(scores).map(([componentId, score]) => ({
        id: '', student_id: row.student.id, subject_id: subjectId,
        class_id: classId, component_id: componentId,
        score: score as number | null, term, academic_year: academicYear,
        entered_by: null, created_at: '', updated_at: '',
      })),
      components
    )
  })

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(studentId: string, componentId: string, value: string) {
    const key = `${studentId}:${componentId}`
    const comp = components.find((c) => c.id === componentId)
    const newScores = { ...localScores, [key]: value }
    setLocalScores(newScores)
    saveDraft(newScores)

    if (value === '') {
      setErrors((e) => { const n = { ...e }; delete n[key]; return n })
      return
    }

    if (comp) {
      const { valid, error } = validateScore(value, comp.max_score)
      if (!valid && error) setErrors((e) => ({ ...e, [key]: error }))
      else setErrors((e) => { const n = { ...e }; delete n[key]; return n })
    }
  }

  async function handleBlur(studentId: string, componentId: string) {
    const key   = `${studentId}:${componentId}`
    const value = localScores[key] ?? ''
    const comp  = components.find((c) => c.id === componentId)
    if (!comp) return

    const { valid, score } = validateScore(value, comp.max_score)
    if (!valid) return // don't save invalid values

    setSaving((s) => ({ ...s, [key]: true }))
    try {
      const result = await upsertGradeAction(
        studentId, subjectId, classId, componentId,
        score, term, academicYear
      )
      if (result.error) {
        setErrors((e) => ({ ...e, [key]: result.error! }))
        toast.error(result.error)
      } else {
        // Clear draft entry for this key on successful save
        setErrors((e) => { const n = { ...e }; delete n[key]; return n })
      }
    } finally {
      setSaving((s) => { const n = { ...s }; delete n[key]; return n })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const next = inputRefs.current[index + 1]
      if (next) next.focus()
      else inputRefs.current[0]?.focus() // wrap to top
    }
  }

  const activeComp = components.find((c) => c.id === activeComponent)

  return (
    <div className="pb-24">
      {/* Component tabs */}
      <div className="flex gap-1 px-4 py-3 bg-white border-b border-surface-border">
        {components.map((comp) => (
          <button
            key={comp.id}
            onClick={() => setActiveComponent(comp.id)}
            className={`flex-1 min-h-touch flex flex-col items-center justify-center px-2 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150
              ${activeComponent === comp.id
                ? 'bg-sidebar text-white'
                : 'bg-slate-100 text-ink-muted hover:bg-slate-200'}`}
          >
            <span className="font-semibold">{comp.name}</span>
            <span className="text-xs opacity-70 mt-0.5">/{comp.max_score}</span>
          </button>
        ))}
      </div>

      {/* Student rows */}
      <div className="divide-y divide-surface-border bg-white">
        {computedRows.map((row, idx) => {
          const key        = `${row.student.id}:${activeComponent}`
          const isSaving   = saving[key]
          const error      = errors[key]
          const score      = localScores[key] ?? ''
          const isComplete = row.isComplete

          return (
            <div
              key={row.student.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              {/* Rank / index */}
              <span className="w-6 text-xs text-ink-subtle text-right flex-shrink-0 font-mono">
                {idx + 1}
              </span>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{row.student.full_name}</p>
                {row.student.student_number && (
                  <p className="text-xs text-ink-subtle font-mono">{row.student.student_number}</p>
                )}
              </div>

              {/* Score input */}
              <div className="flex flex-col items-end gap-0.5">
                <div className="relative">
                  <input
                    ref={(el) => { inputRefs.current[idx] = el }}
                    type="number"
                    inputMode="numeric"
                    enterKeyHint="next"
                    min={0}
                    max={activeComp?.max_score}
                    value={score}
                    onChange={(e) => handleChange(row.student.id, activeComponent, e.target.value)}
                    onBlur={() => handleBlur(row.student.id, activeComponent)}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    placeholder="—"
                    aria-label={`Score for ${row.student.full_name}`}
                    className={`score-input w-16 min-h-touch px-2 py-2 rounded-lg border text-sm
                      focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
                      transition-all duration-150
                      ${error
                        ? 'border-red-400 bg-red-50 text-red-700'
                        : 'border-surface-border bg-white text-ink hover:border-slate-300'}`}
                  />
                  {isSaving && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                    </div>
                  )}
                </div>
                {error && (
                  <p className="text-xs text-red-600 flex items-center gap-0.5">
                    <AlertCircle className="w-3 h-3" /> {error}
                  </p>
                )}
              </div>

              {/* Grade badge (shows when all components filled) */}
              {isComplete ? (
                <span className={`grade-badge flex-shrink-0 ${gradeLetterClasses(row.gradeLetter)}`}>
                  {row.gradeLetter}
                </span>
              ) : (
                <div className="w-10 h-7 rounded border border-dashed border-surface-border flex-shrink-0" />
              )}
            </div>
          )
        })}
      </div>

      {/* Floating summary bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-white/10 px-4 py-3 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-white text-sm font-medium">
            {computedRows.filter((r) => r.scores[activeComponent] !== null).length} of {computedRows.length} entered
          </p>
          <p className="text-slate-400 text-xs mt-0.5">Saves automatically on each field</p>
        </div>
        <div className="flex items-center gap-1.5 text-brand text-sm">
          <CheckCircle2 className="w-4 h-4" />
          <span className="font-medium">Auto-save on</span>
        </div>
      </div>
    </div>
  )
}
