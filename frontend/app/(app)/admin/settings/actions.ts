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

// ── Copy staffing from one term to another (within the same academic year) ──
//
// Used by the term-change modal: when the admin moves from First Term to
// Second Term, they usually want the same teachers teaching the same subjects
// to the same classes. This action copies both subject and class-teacher
// assignments. Idempotent — re-running with the same args won't double-up
// thanks to the unique constraints on both tables.

export async function copyTermAssignmentsAction(input: {
  fromTerm: Term
  toTerm: Term
  academicYear: string
}): Promise<
  { error: string }
  | { success: true; copiedSubject: number; copiedClassTeacher: number }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  if (!isValidTerm(input.fromTerm) || !isValidTerm(input.toTerm)) {
    return { error: 'Invalid term.' }
  }
  if (input.fromTerm === input.toTerm) {
    return { success: true, copiedSubject: 0, copiedClassTeacher: 0 }
  }

  // Subject assignments
  const { data: subjectRows, error: subjectFetchErr } = await admin
    .from('teacher_assignments')
    .select('teacher_id, class_id, subject_id')
    .eq('term', input.fromTerm)
    .eq('academic_year', input.academicYear)

  if (subjectFetchErr) return { error: 'Failed to read existing subject assignments.' }

  let copiedSubject = 0
  if (subjectRows && subjectRows.length > 0) {
    const upserts = subjectRows.map((r) => ({
      teacher_id: (r as any).teacher_id,
      class_id: (r as any).class_id,
      subject_id: (r as any).subject_id,
      term: input.toTerm,
      academic_year: input.academicYear,
    }))
    const { error: insErr, count } = await admin
      .from('teacher_assignments')
      .upsert(upserts, {
        onConflict: 'teacher_id,class_id,subject_id,term,academic_year',
        ignoreDuplicates: true,
        count: 'exact',
      })
    if (insErr) return { error: 'Failed to copy subject assignments.' }
    copiedSubject = count ?? upserts.length
  }

  // Class teacher assignments
  const { data: classTeacherRows, error: ctaFetchErr } = await admin
    .from('class_teacher_assignments')
    .select('teacher_id, class_id')
    .eq('term', input.fromTerm)
    .eq('academic_year', input.academicYear)

  if (ctaFetchErr) return { error: 'Failed to read existing class teacher assignments.' }

  let copiedClassTeacher = 0
  if (classTeacherRows && classTeacherRows.length > 0) {
    const upserts = classTeacherRows.map((r) => ({
      teacher_id: (r as any).teacher_id,
      class_id: (r as any).class_id,
      term: input.toTerm,
      academic_year: input.academicYear,
    }))
    const { error: insErr, count } = await admin
      .from('class_teacher_assignments')
      .upsert(upserts, {
        onConflict: 'class_id,term,academic_year',
        ignoreDuplicates: true,
        count: 'exact',
      })
    if (insErr) return { error: 'Failed to copy class teacher assignments.' }
    copiedClassTeacher = count ?? upserts.length
  }

  revalidatePath('/', 'layout')
  return { success: true, copiedSubject, copiedClassTeacher }
}

// ── Apply student promotion + commit the new academic year ──
//
// The wizard hands us a per-student decision; we apply each and then update
// school_settings.current_academic_year so the rest of the app sees the new
// year. No assignments are carried forward — a year rollover is a
// fresh-staff-the-school moment.

export type PromotionAction = 'promote' | 'repeat' | 'graduate' | 'leave'

export interface PromotionMove {
  studentId: string
  action: PromotionAction
  toClassId?: string // required when action='promote', ignored otherwise
}

export async function applyYearRolloverAction(input: {
  newYear: string
  moves: PromotionMove[]
}): Promise<
  { error: string }
  | { success: true; promoted: number; repeated: number; graduated: number; left: number; failed: { studentId: string; reason: string }[] }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  if (!isValidAcademicYear(input.newYear)) {
    return { error: 'Invalid academic year format.' }
  }

  const counts = { promoted: 0, repeated: 0, graduated: 0, left: 0 }
  const failed: { studentId: string; reason: string }[] = []

  for (const move of input.moves) {
    if (move.action === 'leave' || move.action === 'repeat') {
      counts[move.action === 'leave' ? 'left' : 'repeated'] += 1
      continue
    }
    if (move.action === 'graduate') {
      const { error } = await admin
        .from('students')
        .update({ is_active: false })
        .eq('id', move.studentId)
      if (error) failed.push({ studentId: move.studentId, reason: 'Failed to deactivate' })
      else counts.graduated += 1
      continue
    }
    // promote
    if (!move.toClassId) {
      failed.push({ studentId: move.studentId, reason: 'No target class chosen for promotion' })
      continue
    }
    const { error } = await admin
      .from('students')
      .update({ class_id: move.toClassId })
      .eq('id', move.studentId)
    if (error) failed.push({ studentId: move.studentId, reason: 'Failed to move to next class' })
    else counts.promoted += 1
  }

  // Commit the year change last — if any moves fail, the admin can re-run
  // the wizard against the already-updated year and the surviving moves stay.
  const { error: yearErr } = await admin
    .from('school_settings')
    .update({ current_academic_year: input.newYear, updated_by: user.id })
    .eq('id', 1)

  if (yearErr) return { error: 'Promoted students but failed to update academic year. Re-save the year manually in Settings.' }

  revalidatePath('/', 'layout')
  return { success: true, ...counts, failed }
}
