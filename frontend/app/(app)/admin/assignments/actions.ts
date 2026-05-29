'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireWritableYear } from '@/lib/school-settings'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return null
  return admin
}

export async function assignSubjectTeacherAction(
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const admin = await assertAdmin()
  if (!admin) return { error: 'Unauthorised' }
  const guard = await requireWritableYear()
  if (guard) return guard

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
  const guard = await requireWritableYear()
  if (guard) return guard

  const { error } = await admin
    .from('teacher_assignments')
    .delete()
    .eq('id', assignmentId)

  if (error) return { error: 'Failed to remove assignment' }

  revalidatePath('/admin/assignments')
  return { success: true }
}

export async function bulkUpdateTeacherAssignmentsAction(input: {
  teacherId: string
  term: string
  academicYear: string
  additions: Array<{ classId: string; subjectId: string }>
  deletions: string[]
}): Promise<{ added: number; removed: number; error?: string }> {
  const admin = await assertAdmin()
  if (!admin) return { added: 0, removed: 0, error: 'Unauthorised' }
  const guard = await requireWritableYear()
  if (guard) return { added: 0, removed: 0, error: guard.error }

  const { teacherId, term, academicYear, additions, deletions } = input

  if (!teacherId || !term || !academicYear) {
    return { added: 0, removed: 0, error: 'Missing teacher or term' }
  }

  let added = 0
  if (additions.length > 0) {
    const rows = additions.map((a) => ({
      teacher_id: teacherId,
      class_id: a.classId,
      subject_id: a.subjectId,
      term,
      academic_year: academicYear,
    }))

    const { data, error } = await admin
      .from('teacher_assignments')
      .upsert(rows, {
        onConflict: 'teacher_id,class_id,subject_id,term,academic_year',
        ignoreDuplicates: true,
      })
      .select('id')

    if (error) return { added: 0, removed: 0, error: 'Failed to save assignments' }
    added = data?.length ?? 0
  }

  let removed = 0
  if (deletions.length > 0) {
    const { error, count } = await admin
      .from('teacher_assignments')
      .delete({ count: 'exact' })
      .in('id', deletions)

    if (error) return { added, removed: 0, error: 'Failed to remove assignments' }
    removed = count ?? 0
  }

  if (added > 0 || removed > 0) revalidatePath('/admin/assignments')
  return { added, removed }
}
