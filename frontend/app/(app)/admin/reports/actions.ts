'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { requireWritableYear } from '@/lib/school-settings'

/**
 * Upsert the principal's remark for a single (student, term, year).
 *
 * Principal remarks live on the same `student_remarks` row as the class
 * teacher's remark + attendance, so the action upserts on the unique
 * (student_id, term, academic_year) tuple. Class-teacher fields aren't
 * touched.
 *
 * Gated to ADMIN — the class teacher writes their own remark via the class
 * teacher sheet; this is the principal's voice and only the principal /
 * admin should set it.
 */
export async function upsertPrincipalRemarkAction(input: {
  studentId: string
  term: string
  academicYear: string
  /** Trimmed before persisting. Empty string clears the remark. */
  remark: string
}): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const guard = await requireWritableYear()
  if (guard) return guard

  if (!input.studentId || !input.term || !input.academicYear) {
    return { error: 'Missing required fields' }
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  // Pull the class_id from the student so we don't have to thread it through
  // the form — this also acts as a smoke test that the student exists.
  const { data: student } = await admin
    .from('students')
    .select('class_id')
    .eq('id', input.studentId)
    .maybeSingle()
  if (!student?.class_id) return { error: 'Student not found' }

  const trimmed = input.remark.trim()
  if (trimmed.length > 1000) {
    return { error: 'Principal remark is too long (max 1000 characters)' }
  }

  const { error } = await admin
    .from('student_remarks')
    .upsert(
      {
        student_id: input.studentId,
        class_id: student.class_id,
        term: input.term,
        academic_year: input.academicYear,
        principal_remark: trimmed.length === 0 ? null : trimmed,
        entered_by: user.id,
      },
      { onConflict: 'student_id,term,academic_year' },
    )

  if (error) return { error: 'Failed to save principal remark' }

  revalidatePath('/admin/reports')
  return { success: true }
}
