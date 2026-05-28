'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'

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

// ── Bulk enroll (paste roster) ────────────────────────────────────────────────

export async function bulkEnrollStudentsAction(input: {
  classId: string
  subjectIds: string[]
  students: Array<{ fullName: string; studentNumber: string | null }>
}): Promise<{ enrolled: number; failed: Array<{ fullName: string; reason: string }> }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { enrolled: 0, failed: input.students.map((s) => ({ fullName: s.fullName, reason: 'Unauthorised' })) }

  const { classId, subjectIds, students } = input
  if (!classId) return { enrolled: 0, failed: students.map((s) => ({ fullName: s.fullName, reason: 'No class selected' })) }
  if (subjectIds.length === 0) return { enrolled: 0, failed: students.map((s) => ({ fullName: s.fullName, reason: 'No subjects selected' })) }

  let enrolled = 0
  const failed: Array<{ fullName: string; reason: string }> = []

  for (const s of students) {
    const name = s.fullName.trim()
    if (!name) {
      failed.push({ fullName: s.fullName, reason: 'Empty name' })
      continue
    }

    const { data: student, error: studentErr } = await admin
      .from('students')
      .insert({ full_name: name, student_number: s.studentNumber || null, class_id: classId })
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
      .insert(subjectIds.map((sid) => ({ student_id: student.id, subject_id: sid })))

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

  const teacherId = formData.get('teacher_id') as string
  const classId = formData.get('class_id') as string
  const term = formData.get('term') as string
  const academicYear = formData.get('academic_year') as string

  if (!teacherId || !classId || !term || !academicYear) return { error: 'All fields required' }

  const { error } = await admin
    .from('class_teacher_assignments')
    .upsert(
      { teacher_id: teacherId, class_id: classId, term, academic_year: academicYear },
      { onConflict: 'class_id,term,academic_year' },
    )

  if (error) return { error: 'Failed to assign class teacher' }

  revalidatePath('/admin/classes')
  return { success: true }
}
