'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireWritableYear } from '@/lib/school-settings'

export async function upsertRemarkAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const guard = await requireWritableYear()
  if (guard) return guard

  const studentId   = formData.get('student_id') as string
  const classId     = formData.get('class_id') as string
  const term        = formData.get('term') as string
  const academicYear = formData.get('academic_year') as string

  if (!studentId || !classId || !term || !academicYear) {
    return { error: 'Missing required fields' }
  }

  // Security: verify the caller is the class teacher for this class
  const { data: cta } = await supabase
    .from('class_teacher_assignments')
    .select('id')
    .eq('teacher_id', user.id)
    .eq('class_id', classId)
    .eq('term', term)
    .eq('academic_year', academicYear)
    .maybeSingle()

  if (!cta) return { error: 'You are not the class teacher for this class' }

  const timesPresent    = parseInt(formData.get('times_present') as string, 10) || 0
  const timesAbsent     = parseInt(formData.get('times_absent') as string, 10)  || 0
  const timesLate       = parseInt(formData.get('times_late') as string, 10)    || 0
  const behaviourRating = (formData.get('behaviour_rating') as string) || null
  const teacherRemark   = (formData.get('teacher_remark') as string)?.trim() || null

  const payload = {
    student_id:       studentId,
    class_id:         classId,
    entered_by:       user.id,
    term,
    academic_year:    academicYear,
    times_present:    timesPresent,
    times_absent:     timesAbsent,
    times_late:       timesLate,
    behaviour_rating: behaviourRating,
    teacher_remark:   teacherRemark,
  }

  const { error } = await supabase
    .from('student_remarks')
    .upsert(payload, { onConflict: 'student_id,term,academic_year' })

  if (error) return { error: 'Failed to save remark' }

  revalidatePath(`/class-teacher/${classId}`)
  return { success: true }
}

/**
 * Upsert (or delete on score=null) one behaviour-matrix cell for a student.
 *
 * The class-teacher RLS policy on student_behaviour_scores already enforces
 * ownership of the (student, term, year) tuple, but we double-check the CTA
 * row before writing so a tampered classId in the form payload can't pivot
 * the caller to a class they don't lead.
 */
export async function upsertBehaviourScoreAction(input: {
  classId: string
  studentId: string
  activityId: string
  term: string
  academicYear: string
  score: number | null
}): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const guard = await requireWritableYear()
  if (guard) return guard

  if (!input.classId || !input.studentId || !input.activityId || !input.term || !input.academicYear) {
    return { error: 'Missing required fields' }
  }

  // Reject ridiculous payloads up front. Server-side CHECK on the column
  // catches them too, but a clear error message beats a generic 500.
  if (input.score !== null) {
    if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
      return { error: 'Score must be an integer from 1 to 5' }
    }
  }

  // Admin can bypass the class-teacher check. Teachers must lead this class.
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile?.role === 'ADMIN'
  if (!isAdmin) {
    const { data: cta } = await supabase
      .from('class_teacher_assignments')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('class_id', input.classId)
      .eq('term', input.term)
      .eq('academic_year', input.academicYear)
      .maybeSingle()
    if (!cta) return { error: 'You are not the class teacher for this class' }

    // The student must actually be in the caller's class.
    const { data: stu } = await supabase
      .from('students').select('class_id').eq('id', input.studentId).maybeSingle()
    if (!stu || stu.class_id !== input.classId) {
      return { error: 'Student is not in this class' }
    }
  }

  if (input.score === null) {
    // Clear a cell — delete the row. UNIQUE (student, activity, term, year)
    // means at most one row to remove.
    const { error } = await supabase
      .from('student_behaviour_scores')
      .delete()
      .eq('student_id', input.studentId)
      .eq('activity_id', input.activityId)
      .eq('term', input.term)
      .eq('academic_year', input.academicYear)
    if (error) return { error: 'Failed to clear score' }
  } else {
    const { error } = await supabase
      .from('student_behaviour_scores')
      .upsert(
        {
          student_id: input.studentId,
          activity_id: input.activityId,
          term: input.term,
          academic_year: input.academicYear,
          score: input.score,
          entered_by: user.id,
        },
        { onConflict: 'student_id,activity_id,term,academic_year' },
      )
    if (error) return { error: 'Failed to save score' }
  }

  revalidatePath(`/class-teacher/${input.classId}`)
  return { success: true }
}
