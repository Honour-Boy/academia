'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { duplicateNameError, findNameConflict } from '@/lib/name-uniqueness'
import { requireWritableYear, getSchoolSettings } from '@/lib/school-settings'
import { validateStudentNumber } from '@/lib/student-number-validation'

// ── Enroll ────────────────────────────────────────────────────────────────────

export async function enrollStudentAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  const fullName = formData.get('full_name') as string
  const studentNumber = (formData.get('student_number') as string) || null
  const classId = formData.get('class_id') as string
  const subjectIds = formData.getAll('subject_ids') as string[]

  if (!fullName?.trim()) return { error: 'Student name is required' }
  if (!classId) return { error: 'Class is required' }
  if (!subjectIds.length) return { error: 'Select at least one subject' }

  const dup = await findNameConflict(admin, fullName)
  if (dup.conflict) return { error: duplicateNameError(dup.conflict) }

  // Student-number year ↔ class-level guard (Nigerian school convention):
  // a JSS 2 student in 2025/2026 must have entry year 2024.
  if (studentNumber) {
    const { data: classRow } = await admin
      .from('classes').select('level').eq('id', classId).maybeSingle()
    const { currentAcademicYear } = await getSchoolSettings()
    const check = validateStudentNumber(
      studentNumber,
      classRow?.level ?? null,
      currentAcademicYear,
    )
    if (!check.valid) return { error: check.reason ?? 'Invalid student number for this class' }
  }

  // Create student
  const { data: student, error: studentErr } = await admin
    .from('students')
    .insert({ full_name: fullName.trim(), student_number: studentNumber, class_id: classId })
    .select()
    .single()

  if (studentErr) return { error: 'Failed to enroll student. Student number may already be taken.' }

  // Create subject enrollments
  const { error: subjErr } = await admin
    .from('student_subjects')
    .insert(subjectIds.map((sid) => ({ student_id: student.id, subject_id: sid })))

  if (subjErr) {
    await admin.from('students').delete().eq('id', student.id)
    return { error: 'Failed to save subject enrollments' }
  }

  revalidatePath('/admin/students')
  redirect('/admin/students')
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateStudentAction(studentId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  const fullName = formData.get('full_name') as string
  const studentNumber = (formData.get('student_number') as string) || null
  const classId = formData.get('class_id') as string
  const subjectIds = formData.getAll('subject_ids') as string[]

  if (!fullName?.trim()) return { error: 'Student name is required' }
  if (!classId) return { error: 'Class is required' }

  const dup = await findNameConflict(admin, fullName, { ignoreStudentId: studentId })
  if (dup.conflict) return { error: duplicateNameError(dup.conflict) }

  if (studentNumber) {
    const { data: classRow } = await admin
      .from('classes').select('level').eq('id', classId).maybeSingle()
    const { currentAcademicYear } = await getSchoolSettings()
    const check = validateStudentNumber(
      studentNumber,
      classRow?.level ?? null,
      currentAcademicYear,
    )
    if (!check.valid) return { error: check.reason ?? 'Invalid student number for this class' }
  }

  const { error: studentErr } = await admin
    .from('students')
    .update({ full_name: fullName.trim(), student_number: studentNumber, class_id: classId })
    .eq('id', studentId)

  if (studentErr) return { error: 'Failed to update student' }

  if (subjectIds.length > 0) {
    await admin.from('student_subjects').delete().eq('student_id', studentId)
    const { error: subjErr } = await admin
      .from('student_subjects')
      .insert(subjectIds.map((sid) => ({ student_id: studentId, subject_id: sid })))
    if (subjErr) return { error: 'Failed to update subject enrollments' }
  }

  revalidatePath('/admin/students')
  redirect('/admin/students')
}

// ── Deactivate / reactivate ───────────────────────────────────────────────────

export async function setStudentActiveAction(studentId: string, isActive: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  const { error } = await admin
    .from('students')
    .update({ is_active: isActive })
    .eq('id', studentId)

  if (error) return { error: 'Failed to update student status' }

  revalidatePath('/admin/students')
  return { success: true }
}

// ── Bulk enroll (per-row class + subjects) ────────────────────────────────────

export interface BulkEnrollRow {
  fullName: string
  studentNumber: string | null
  classId: string
  subjectIds: string[]
}

export async function bulkEnrollStudentsAction(input: {
  students: BulkEnrollRow[]
}): Promise<{ enrolled: number; failed: Array<{ fullName: string; reason: string }> }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { enrolled: 0, failed: input.students.map((s) => ({ fullName: s.fullName, reason: 'Unauthorised' })) }

  // Resolve class levels once for the whole batch so the student-number/year
  // validator can run without N round-trips.
  const classIds = Array.from(new Set(input.students.map((s) => s.classId).filter(Boolean)))
  const classLevelMap = new Map<string, string>()
  if (classIds.length > 0) {
    const { data: classRows } = await admin
      .from('classes').select('id, level').in('id', classIds)
    for (const r of classRows ?? []) {
      classLevelMap.set((r as any).id as string, (r as any).level as string)
    }
  }
  const { currentAcademicYear } = await getSchoolSettings()

  let enrolled = 0
  const failed: Array<{ fullName: string; reason: string }> = []

  for (const s of input.students) {
    const name = s.fullName.trim()
    if (!name) {
      failed.push({ fullName: s.fullName, reason: 'Empty name' })
      continue
    }
    if (!s.classId) {
      failed.push({ fullName: name, reason: 'No class' })
      continue
    }
    if (s.subjectIds.length === 0) {
      failed.push({ fullName: name, reason: 'No subjects' })
      continue
    }

    // Student-number ↔ class-level year check.
    if (s.studentNumber) {
      const check = validateStudentNumber(
        s.studentNumber,
        classLevelMap.get(s.classId) ?? null,
        currentAcademicYear,
      )
      if (!check.valid) {
        failed.push({ fullName: name, reason: check.reason ?? 'Invalid student number for class' })
        continue
      }
    }

    // Catches duplicates against any existing staff/student. Inserts done earlier
    // in this loop are already visible to the query, so intra-batch duplicates
    // are caught after the first row lands.
    const dup = await findNameConflict(admin, name)
    if (dup.conflict) {
      failed.push({ fullName: name, reason: duplicateNameError(dup.conflict) })
      continue
    }

    const { data: student, error: studentErr } = await admin
      .from('students')
      .insert({ full_name: name, student_number: s.studentNumber || null, class_id: s.classId })
      .select('id')
      .single()

    if (studentErr || !student) {
      const reason = studentErr?.code === '23505'
        ? 'Student number already in use'
        : 'Failed to insert'
      failed.push({ fullName: name, reason })
      continue
    }

    const { error: subjErr } = await admin
      .from('student_subjects')
      .insert(s.subjectIds.map((sid) => ({ student_id: student.id, subject_id: sid })))

    if (subjErr) {
      await admin.from('students').delete().eq('id', student.id)
      failed.push({ fullName: name, reason: 'Failed to attach subjects' })
      continue
    }

    enrolled += 1
  }

  if (enrolled > 0) revalidatePath('/admin/students')
  return { enrolled, failed }
}

// ── Assign class teacher ──────────────────────────────────────────────────────

export async function assignClassTeacherAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }
  const guard = await requireWritableYear()
  if (guard) return guard

  const teacherId = formData.get('teacher_id') as string
  const classId = formData.get('class_id') as string
  const term = formData.get('term') as string
  const academicYear = formData.get('academic_year') as string

  if (!classId || !term || !academicYear) return { error: 'All fields required' }

  if (!teacherId) {
    // Empty teacher → unassign.
    const { error } = await admin
      .from('class_teacher_assignments')
      .delete()
      .eq('class_id', classId)
      .eq('term', term)
      .eq('academic_year', academicYear)
    if (error) return { error: 'Failed to unassign class teacher' }
  } else {
    const { error } = await admin
      .from('class_teacher_assignments')
      .upsert(
        { teacher_id: teacherId, class_id: classId, term, academic_year: academicYear },
        { onConflict: 'class_id,term,academic_year' },
      )
    if (error) return { error: 'Failed to assign class teacher' }
  }

  revalidatePath('/admin/classes')
  return { success: true }
}

// ── Bulk assign class teachers (one shot, many classes) ───────────────────────

export interface BulkAssignRow {
  classId: string
  teacherId: string | null // null = unassign
}

export async function bulkAssignClassTeachersAction(input: {
  rows: BulkAssignRow[]
  term: string
  academicYear: string
}): Promise<{ saved: number; failed: Array<{ classId: string; reason: string }> }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') {
    return { saved: 0, failed: input.rows.map((r) => ({ classId: r.classId, reason: 'Unauthorised' })) }
  }
  const guard = await requireWritableYear()
  if (guard) {
    return { saved: 0, failed: input.rows.map((r) => ({ classId: r.classId, reason: guard.error })) }
  }

  // Reject intra-batch duplicate teachers up front — a teacher can hold only
  // one class-teacher slot per (term, year).
  const seen = new Map<string, string>()
  const failed: Array<{ classId: string; reason: string }> = []
  const upserts: { teacher_id: string; class_id: string; term: string; academic_year: string }[] = []
  const deletes: string[] = []

  for (const r of input.rows) {
    if (r.teacherId === null || r.teacherId === '') {
      deletes.push(r.classId)
      continue
    }
    const prior = seen.get(r.teacherId)
    if (prior) {
      failed.push({ classId: r.classId, reason: 'Teacher already assigned in this batch' })
      continue
    }
    seen.set(r.teacherId, r.classId)
    upserts.push({
      teacher_id: r.teacherId,
      class_id: r.classId,
      term: input.term,
      academic_year: input.academicYear,
    })
  }

  let saved = 0

  for (const classId of deletes) {
    const { error } = await admin
      .from('class_teacher_assignments')
      .delete()
      .eq('class_id', classId)
      .eq('term', input.term)
      .eq('academic_year', input.academicYear)
    if (error) failed.push({ classId, reason: 'Failed to unassign' })
    else saved += 1
  }

  if (upserts.length > 0) {
    // Do upserts one row at a time so a single conflict (e.g. teacher already
    // assigned elsewhere via DB unique constraint) doesn't sink the batch.
    for (const row of upserts) {
      const { error } = await admin
        .from('class_teacher_assignments')
        .upsert(row, { onConflict: 'class_id,term,academic_year' })
      if (error) failed.push({ classId: row.class_id, reason: 'Failed to assign' })
      else saved += 1
    }
  }

  if (saved > 0) revalidatePath('/admin/classes')
  return { saved, failed }
}
