import type { GradeLetter, ScoreComponent, Student, Grade, StudentGradeRow } from '@/types'

// ─── Grade Letter Calculation (Nigerian WAEC system) ─────────────────────────

export function getGradeLetter(percentage: number): GradeLetter {
  if (percentage >= 75) return 'A1'
  if (percentage >= 70) return 'B2'
  if (percentage >= 65) return 'B3'
  if (percentage >= 60) return 'C4'
  if (percentage >= 55) return 'C5'
  if (percentage >= 50) return 'C6'
  if (percentage >= 45) return 'D7'
  if (percentage >= 40) return 'E8'
  return 'F9'
}

export function isPassingGrade(letter: GradeLetter): boolean {
  return !['F9'].includes(letter)
}

export function gradeLetterClasses(letter: GradeLetter): string {
  const map: Record<GradeLetter, string> = {
    A1: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300',
    B2: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
    B3: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
    C4: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300',
    C5: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
    C6: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
    D7: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300',
    E8: 'bg-orange-50 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300',
    F9: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
  }
  return map[letter]
}

// ─── Score Computation ────────────────────────────────────────────────────────

export function computeStudentRow(
  student: Student,
  grades: Grade[],
  components: ScoreComponent[]
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
    gradeLetter: getGradeLetter(percentage),
    isComplete,
  }
}

export function computeClassRows(
  students: Student[],
  grades: Grade[],
  components: ScoreComponent[]
): StudentGradeRow[] {
  return students
    .filter((s) => s.is_active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((s) => computeStudentRow(s, grades, components))
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
