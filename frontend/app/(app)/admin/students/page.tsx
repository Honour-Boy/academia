import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, BookOpen } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { getSchoolSettings } from '@/lib/school-settings'
import StudentsBrowser from './StudentsBrowser'
import StudentsCSVExport from './StudentsCSVExport'

export const metadata: Metadata = { title: 'Admin · Students' }

export default async function StudentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { currentTerm: term, currentAcademicYear: year } = await getSchoolSettings()

  const [
    { data: students },
    { data: classTeacherAssignments },
    { data: studentSubjects },
  ] = await Promise.all([
    supabase
      .from('students')
      .select(`
        id, full_name, student_number, is_active, created_at,
        classes(id, name, level, arm)
      `)
      .order('full_name'),
    // Class teacher per class for the current term — used to enrich the CSV
    // with "Class teacher" instead of leaving the column blank.
    supabase
      .from('class_teacher_assignments')
      .select('class_id, profiles!teacher_id(full_name)')
      .eq('term', term)
      .eq('academic_year', year),
    // Subject offerings per student so the CSV "Subjects" column reflects
    // what each student actually takes.
    supabase
      .from('student_subjects')
      .select('student_id, subjects!subject_id(name)'),
  ])

  const classTeacherByClass = new Map<string, string>()
  for (const a of classTeacherAssignments ?? []) {
    const cid = (a as any).class_id as string
    const name = (a as any).profiles?.full_name as string | undefined
    if (cid && name) classTeacherByClass.set(cid, name)
  }

  const subjectsByStudent = new Map<string, string[]>()
  for (const r of studentSubjects ?? []) {
    const sid = (r as any).student_id as string
    const subjectName = (r as any).subjects?.name as string | undefined
    if (!sid || !subjectName) continue
    const list = subjectsByStudent.get(sid) ?? []
    list.push(subjectName)
    subjectsByStudent.set(sid, list)
  }

  const rows = (students ?? []).map((s) => {
    const cls = s.classes as unknown as { id: string; name: string } | { id: string; name: string }[] | null
    const c = Array.isArray(cls) ? cls[0] : cls
    const classId = c?.id ?? null
    return {
      id: s.id as string,
      full_name: s.full_name as string,
      student_number: (s.student_number ?? null) as string | null,
      is_active: s.is_active as boolean,
      classId,
      className: c?.name ?? null,
      classTeacher: classId ? classTeacherByClass.get(classId) ?? null : null,
      subjects: (subjectsByStudent.get(s.id as string) ?? []).sort(),
    }
  })

  const active = rows.filter((s) => s.is_active)
  const inactive = rows.filter((s) => !s.is_active)

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Students</h2>
          <p className="text-sm text-ink-muted mt-1">
            {active.length} active · {inactive.length} deactivated. Enrol students and pick which subjects they take.
            <span className="text-ink-subtle"> · Grouped by class for {term} · {year}.</span>
          </p>
        </div>
        <Link href="/admin/students/new" className="btn-brand">
          <Plus className="w-4 h-4" /> Enrol student
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No students enrolled yet"
          description="Enrol your first student. You'll pick their class and subject offerings in one step."
          primaryAction={{ label: 'Enrol first student', href: '/admin/students/new' }}
        />
      ) : (
        <>
          <div className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-ink">Download student data</h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Export enrolment info (names, IDs, class, class teacher, subjects). For report sheets, use Reports.
              </p>
            </div>
            <StudentsCSVExport rows={rows} term={term} year={year} />
          </div>
          <StudentsBrowser rows={rows} />
        </>
      )}
    </div>
  )
}
