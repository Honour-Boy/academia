// Single source of truth for "what term and year is the school in right now".
//
// Before migration 006 these were computed from the wall-clock date in
// grade-utils.ts. They now read from school_settings (single-row table,
// admin-editable via /admin/settings).
//
// Reads use the user's request-bound Supabase client — RLS allows every
// authenticated user to SELECT. If the row is somehow missing (broken seed,
// new project), we fall back to the date-based heuristic so the app still
// boots; the migration ensures the seed exists in any sanely-applied project.

import { createClient } from '@/lib/supabase/server'
import type { Term } from '@/lib/grade-utils'

export interface SchoolSettings {
  currentTerm: Term
  currentAcademicYear: string
}

// Date-based fallback. Used only when the DB row is unreachable; never the
// primary path. Kept here (not in grade-utils) so the only export from
// grade-utils is the synchronous list of valid terms.
function fallbackFromDate(): SchoolSettings {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const currentAcademicYear =
    month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`
  let currentTerm: Term = 'Third Term'
  if (month >= 9 || month <= 12) currentTerm = 'First Term'
  else if (month >= 1 && month <= 4) currentTerm = 'Second Term'
  return { currentTerm, currentAcademicYear }
}

export async function getSchoolSettings(): Promise<SchoolSettings> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('school_settings')
    .select('current_term, current_academic_year')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) return fallbackFromDate()
  return {
    currentTerm: data.current_term as Term,
    currentAcademicYear: data.current_academic_year,
  }
}

// Convenience accessors so callsites that only need one value don't have to
// destructure the whole object.
export async function getCurrentTerm(): Promise<Term> {
  return (await getSchoolSettings()).currentTerm
}

export async function getCurrentAcademicYear(): Promise<string> {
  return (await getSchoolSettings()).currentAcademicYear
}
