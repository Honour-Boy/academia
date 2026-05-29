import type { GradeLetter, ScoreComponent, Student, Grade, StudentGradeRow } from '@/types'
import {
  DEFAULT_GRADING_SCALE,
  gradeLetterFromScale,
  letterClasses,
  type GradingScaleRow,
} from '@/lib/grading-scale'

// ─── Grade Letter Calculation ────────────────────────────────────────────────
// Scale is admin-configurable via the `grading_scale` table; callers should
// pass the scale they've already fetched. The legacy DEFAULT_GRADING_SCALE
// fallback below keeps places that haven't been threaded through (yet) from
// crashing — they'll just use the WAEC defaults.

/** Backwards-compatible wrapper. Pass a scale for admin-configured grades. */
export function getGradeLetter(percentage: number, scale: GradingScaleRow[] = DEFAULT_GRADING_SCALE): GradeLetter {
  return gradeLetterFromScale(percentage, scale) as GradeLetter
}

export function isPassingGrade(letter: string, scale: GradingScaleRow[] = DEFAULT_GRADING_SCALE): boolean {
  // Lowest letter in the scale (largest sort_order) is treated as failing.
  const sorted = [...scale].sort((a, b) => a.sort_order - b.sort_order)
  const lowest = sorted[sorted.length - 1]?.letter
  return letter !== lowest
}

/** Re-export so legacy imports of `gradeLetterClasses` keep working. */
export const gradeLetterClasses = letterClasses

// ─── Score Computation ────────────────────────────────────────────────────────

export function computeStudentRow(
  student: Student,
  grades: Grade[],
  components: ScoreComponent[],
  scale: GradingScaleRow[] = DEFAULT_GRADING_SCALE,
): StudentGradeRow {
  const scores: Record<string, number | null> = {}

  for (const comp of components) {
    const grade = grades.find(
      (g) => g.student_id === student.id && g.component_id === comp.id
    )
    scores[comp.id] = grade?.score ?? null
  }

  const totalMaxScore = components.reduce((s, c) => s + c.max_score, 0)
  const enteredScores = components.map((c) => scores[c.id])
  const isComplete = enteredScores.every((s) => s !== null)

  const total = enteredScores.reduce<number>(
    (s, score) => s + (score ?? 0),
    0
  )

  const percentage = isComplete && totalMaxScore > 0
    ? (total / totalMaxScore) * 100
    : 0

  return {
    student,
    scores,
    total,
    percentage: Math.round(percentage * 10) / 10,
    gradeLetter: getGradeLetter(percentage, scale),
    isComplete,
  }
}

export function computeClassRows(
  students: Student[],
  grades: Grade[],
  components: ScoreComponent[],
  scale: GradingScaleRow[] = DEFAULT_GRADING_SCALE,
): StudentGradeRow[] {
  return students
    .filter((s) => s.is_active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((s) => computeStudentRow(s, grades, components, scale))
}

// ─── Class Statistics ─────────────────────────────────────────────────────────

export function classStats(rows: StudentGradeRow[]) {
  const complete = rows.filter((r) => r.isComplete)
  const avg =
    complete.length > 0
      ? complete.reduce((s, r) => s + r.percentage, 0) / complete.length
      : 0

  const dist = rows.reduce<Record<GradeLetter, number>>(
    (acc, r) => {
      if (r.isComplete) acc[r.gradeLetter] = (acc[r.gradeLetter] ?? 0) + 1
      return acc
    },
    {} as Record<GradeLetter, number>
  )

  return {
    total: rows.length,
    graded: complete.length,
    average: Math.round(avg * 10) / 10,
    distribution: dist,
  }
}

// ─── Validate score against component max ─────────────────────────────────────

export function validateScore(
  value: string,
  maxScore: number
): { valid: boolean; score: number | null; error?: string } {
  if (value === '' || value === null) return { valid: true, score: null }

  const n = parseFloat(value)
  if (isNaN(n)) return { valid: false, score: null, error: 'Must be a number' }
  if (n < 0) return { valid: false, score: null, error: 'Cannot be negative' }
  if (n > maxScore)
    return { valid: false, score: null, error: `Max score is ${maxScore}` }

  return { valid: true, score: Math.round(n * 100) / 100 }
}

// ─── Term / Year helpers ──────────────────────────────────────────────────────
//
// The CURRENT term/year are admin-controlled and stored in school_settings.
// Read them via `getCurrentTerm()` / `getCurrentAcademicYear()` in
// `lib/school-settings.ts`. This module only owns the static list of valid
// terms; it doesn't compute "now".

export const TERMS = ['First Term', 'Second Term', 'Third Term'] as const
export type Term = (typeof TERMS)[number]
