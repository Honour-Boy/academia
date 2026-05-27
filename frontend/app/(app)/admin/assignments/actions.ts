'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return null
  return admin
}

export async function assignSubjectTeacherAction(formData: FormData) {
  const admin = await assertAdmin()
  if (!admin) return { error: 'Unauthorised' }

  const teacherId = formData.get('teacher_id') as string
  const classId = formData.get('class_id') as string
  const subjectId = formData.get('subject_id') as string
  const term = formData.get('term') as string
  const academicYear = formData.get('academic_year') as string

  if (!teacherId || !classId || !subjectId || !term || !academicYear) {
    return { error: 'All fields are required' }
  }

  const { error } = await admin
    .from('teacher_assignments')
    .insert({ teacher_id: teacherId, class_id: classId, subject_id: subjectId, term, academic_year: academicYear })

  if (error) {
    if (error.code === '23505') return { error: 'That teacher is already assigned to this subject for this class' }
    return { error: 'Failed to create assignment' }
  }

  revalidatePath('/admin/assignments')
  return { success: true }
}

export async function removeAssignmentAction(assignmentId: string) {
  const admin = await assertAdmin()
  if (!admin) return { error: 'Unauthorised' }

  const { error } = await admin
    .from('teacher_assignments')
    .delete()
    .eq('id', assignmentId)

  if (error) return { error: 'Failed to remove assignment' }

  revalidatePath('/admin/assignments')
  return { success: true }
}
