'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function upsertRemarkAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
