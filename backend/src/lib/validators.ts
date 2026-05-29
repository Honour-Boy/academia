import { z } from 'zod'
import { adminClient } from './supabase'

// ── Reusable zod primitives ───────────────────────────────────────────────────

export const uuidSchema = z.string().uuid()
export const termSchema = z.enum(['First Term', 'Second Term', 'Third Term'])
// "YYYY/YYYY" — validated server-side so a tampered request can't index into
// a malformed academic_year that bypasses migration-008's CHECK constraint.
export const academicYearSchema = z.string().regex(/^\d{4}\/\d{4}$/, 'Invalid academic year format (expected YYYY/YYYY)')

// Upper-bound on raw score input. Hard ceiling that catches obviously-tampered
// payloads before we even hit the per-component max_score lookup. No component
// in the school's catalogue is ≥ 100 (CA1=20, CA2=20, Exam=60), so 100 is a
// generous backstop.
export const RAW_SCORE_CEILING = 100

// ── Score authorization helpers ───────────────────────────────────────────────

/**
 * Check that a teacher's session is authorised to read/write grades for the
 * given (class_id, subject_id). Used by GET and PUT on /grades so a tampered
 * payload can't pivot to another class+subject the teacher doesn't teach.
 *
 * ADMIN bypasses; callers should short-circuit on role === 'ADMIN' before
 * calling.
 */
export async function teacherOwnsAssignment(
  teacherId: string,
  classId: string,
  subjectId: string,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('teacher_assignments')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .limit(1)
    .maybeSingle()
  if (error) return false
  return !!data
}

/**
 * Check that a teacher is authorised to view a student's roster info — true
 * when the teacher is a subject teacher for the student's class OR the class
 * teacher of that class. Used by /students/:id/subjects to stop one teacher
 * from enumerating another teacher's roster.
 */
export async function teacherCanSeeStudent(
  teacherId: string,
  studentId: string,
): Promise<boolean> {
  const { data: student } = await adminClient
    .from('students')
    .select('class_id')
    .eq('id', studentId)
    .maybeSingle()
  if (!student?.class_id) return false

  const classId = student.class_id as string

  const { data: ta } = await adminClient
    .from('teacher_assignments')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('class_id', classId)
    .limit(1)
    .maybeSingle()
  if (ta) return true

  const { data: cta } = await adminClient
    .from('class_teacher_assignments')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('class_id', classId)
    .limit(1)
    .maybeSingle()
  return !!cta
}

/**
 * Fetch a score component's max_score. Used to enforce that an incoming score
 * for, e.g., CA1 (max 20) can't be set to 90 — even if the raw-score ceiling
 * lets it through.
 */
export async function getComponentMaxScore(
  componentId: string,
): Promise<number | null> {
  const { data, error } = await adminClient
    .from('score_components')
    .select('max_score')
    .eq('id', componentId)
    .maybeSingle()
  if (error || !data) return null
  return typeof data.max_score === 'number' ? data.max_score : null
}
