'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'

function isValidYear(value: string): boolean {
  return /^\d{4}\/\d{4}$/.test(value)
}

/**
 * Permanently delete every year-scoped record for the given academic_year.
 * Touches:
 *   - grades (cascade deletes grade_audit_log via FK ON DELETE CASCADE)
 *   - teacher_assignments
 *   - class_teacher_assignments
 *   - student_remarks
 * Then removes the academic_year from year_archives.
 *
 * Refuses to delete the currently-active year — admin must switch first.
 */
export async function deleteYearArchiveAction(input: {
  year: string
  confirmYear: string
}): Promise<{ error: string } | { success: true; counts: Record<string, number> }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  if (!isValidYear(input.year)) return { error: 'Invalid academic_year.' }
  if (input.confirmYear !== input.year) {
    return { error: 'Confirmation text does not match the year. Type the year exactly to delete.' }
  }

  const { data: settings } = await admin
    .from('school_settings')
    .select('current_academic_year')
    .eq('id', 1)
    .maybeSingle()
  if (settings?.current_academic_year === input.year) {
    return {
      error: `Cannot delete ${input.year} — it is the school's active year. Switch to a different year via /admin/settings first.`,
    }
  }

  const counts: Record<string, number> = {}

  // Delete in dependency order. grade_audit_log cascades from grades.
  const tables: { name: string; key: string }[] = [
    { name: 'grades',                     key: 'academic_year' },
    { name: 'teacher_assignments',        key: 'academic_year' },
    { name: 'class_teacher_assignments',  key: 'academic_year' },
    { name: 'student_remarks',            key: 'academic_year' },
  ]
  for (const t of tables) {
    const { error, count } = await admin
      .from(t.name)
      .delete({ count: 'exact' })
      .eq(t.key, input.year)
    if (error) return { error: `Failed deleting ${t.name}: ${error.message}` }
    counts[t.name] = count ?? 0
  }

  await admin.from('year_archives').delete().eq('academic_year', input.year)

  revalidatePath('/admin/settings')
  revalidatePath('/admin/settings/year-archives')
  return { success: true, counts }
}
