'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { TERMS, type Term } from '@/lib/grade-utils'

// Loose academic-year format check: "YYYY/YYYY" with the second year being the
// first year + 1. Rejects "2025/2025", "2025/2030", "abc/def", etc.
function isValidAcademicYear(value: string): boolean {
  const m = value.trim().match(/^(\d{4})\/(\d{4})$/)
  if (!m) return false
  const a = parseInt(m[1], 10)
  const b = parseInt(m[2], 10)
  return b === a + 1
}

function isValidTerm(value: string): value is Term {
  return (TERMS as readonly string[]).includes(value)
}

export async function updateSchoolSettingsAction(formData: FormData): Promise<
  { error: string } | { success: true; changed: { term: boolean; year: boolean } }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  const term = (formData.get('current_term') as string)?.trim()
  const year = (formData.get('current_academic_year') as string)?.trim()

  if (!isValidTerm(term)) return { error: 'Invalid term. Expected First / Second / Third Term.' }
  if (!isValidAcademicYear(year)) {
    return { error: 'Academic year must be in the form "YYYY/YYYY" with consecutive years (e.g. 2025/2026).' }
  }

  // Read the current row so we can tell the caller what actually changed —
  // PR C's copy-forward modal needs this signal.
  const { data: existing } = await admin
    .from('school_settings')
    .select('current_term, current_academic_year')
    .eq('id', 1)
    .maybeSingle()

  const termChanged = existing?.current_term !== term
  const yearChanged = existing?.current_academic_year !== year

  if (!termChanged && !yearChanged) {
    return { success: true, changed: { term: false, year: false } }
  }

  const { error } = await admin
    .from('school_settings')
    .update({
      current_term: term,
      current_academic_year: year,
      updated_by: user.id,
    })
    .eq('id', 1)

  if (error) return { error: 'Failed to update school settings.' }

  // Every grade-related page reads these — invalidate everything admin-side
  // plus the teacher surfaces.
  revalidatePath('/', 'layout')
  return { success: true, changed: { term: termChanged, year: yearChanged } }
}
