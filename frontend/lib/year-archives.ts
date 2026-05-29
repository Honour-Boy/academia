// Helpers around year_archives. Used by the year picker on admin pages, the
// wizard's backward-switch path, and the per-year export/delete.

import { createClient } from '@/lib/supabase/server'
import { getSchoolSettings } from '@/lib/school-settings'

export interface YearArchive {
  academic_year: string
  first_seen_at: string
  last_active_at: string
}

export async function listYearArchives(): Promise<YearArchive[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('year_archives')
    .select('academic_year, first_seen_at, last_active_at')
    .order('academic_year', { ascending: false })
  return (data ?? []) as YearArchive[]
}

/**
 * Resolve the year the admin is "looking at" on a given page:
 *   - if ?year=<value> is in the URL, that takes precedence
 *   - otherwise, the school's current academic_year
 *
 * The returned `isReadOnly` flag tells the page to disable mutating UI when
 * the admin is browsing a past year (year != currentAcademicYear).
 */
export async function resolveActiveYear(searchYear: string | undefined): Promise<{
  year: string
  currentYear: string
  isReadOnly: boolean
}> {
  const { currentAcademicYear } = await getSchoolSettings()
  const year = (searchYear ?? '').trim() || currentAcademicYear
  return {
    year,
    currentYear: currentAcademicYear,
    isReadOnly: year !== currentAcademicYear,
  }
}

/** "2025/2026" → 2025. Returns null on garbage input. */
export function parseYearStart(value: string): number | null {
  const m = value.trim().match(/^(\d{4})\/\d{4}$/)
  return m ? parseInt(m[1], 10) : null
}
