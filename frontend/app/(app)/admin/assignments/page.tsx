import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Network, Plus, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSchoolSettings } from '@/lib/school-settings'
import AssignSubjectTeacherForm from './AssignSubjectTeacherForm'
import AssignmentMatrix from './AssignmentMatrix'
import AssignmentsBrowser, { type AssignmentRow } from './AssignmentsBrowser'

export const metadata: Metadata = { title: 'Admin · Subject Assignments' }

export default async function AssignmentsAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { currentTerm: term, currentAcademicYear: year } = await getSchoolSettings()

  const [
    { data: teachers },
    { data: classes },
    { data: subjects },
    { data: assignments },
    { data: staffSubjectRequests },
  ] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'TEACHER').eq('is_active', true).order('full_name'),
    supabase.from('classes').select('id, name').order('name'),
    supabase.from('subjects').select('id, name').order('name'),
    supabase
      .from('teacher_assignments')
      .select('id, teacher_id, class_id, subject_id, profiles!teacher_id(full_name), classes!class_id(name), subjects!subject_id(name)')
      .eq('term', term)
      .eq('academic_year', year)
      .order('created_at', { ascending: false }),
    // Subjects each staff member declared they teach at registration. Used to
    // filter the matrix to "only the subjects this teacher can teach" in Add
    // mode — admins shouldn't see all 13 subjects when they pick a teacher
    // who only registered for 3.
    supabase.from('staff_subject_requests').select('profile_id, subject_id'),
  ])

  // Per-teacher registered subject IDs. Teachers with no rows (admin-created
  // accounts that skipped self-registration) get an empty array; the matrix
  // falls back to showing all subjects with a hint banner for those.
  const registeredSubjectsByTeacher: Record<string, string[]> = {}
  for (const r of staffSubjectRequests ?? []) {
    const profileId = (r as any).profile_id as string
    const subjectId = (r as any).subject_id as string
    const list = registeredSubjectsByTeacher[profileId] ?? []
    list.push(subjectId)
    registeredSubjectsByTeacher[profileId] = list
  }

  const rawAssignments = (assignments ?? []).map((a: any) => ({
    id: a.id as string,
    teacher_id: a.teacher_id as string,
    class_id: a.class_id as string,
    subject_id: a.subject_id as string,
  }))

  const rows: AssignmentRow[] = (assignments ?? []).map((a: any) => ({
    id: a.id as string,
    teacherId: a.teacher_id as string,
    teacherName: a.profiles?.full_name ?? '—',
    className: a.classes?.name ?? '—',
    subjectName: a.subjects?.name ?? '—',
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Subject assignments</h2>
        <p className="text-sm text-ink-muted mt-1">
          Connect teachers to classes for specific subjects. Drives grade-entry access for{' '}
          <span className="font-medium text-ink">{term} · {year}</span>.
        </p>
      </div>

      <div className="card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-primary-light text-brand-primary-dark">
            <Network className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold text-ink">Bulk assignment matrix</h3>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-brand-secondary-dark bg-brand-secondary-light px-2 py-0.5 rounded">
            New
          </span>
        </div>
        <AssignmentMatrix
          teachers={teachers ?? []}
          classes={classes ?? []}
          subjects={subjects ?? []}
          assignments={rawAssignments}
          registeredSubjectsByTeacher={registeredSubjectsByTeacher}
          term={term}
          academicYear={year}
        />
      </div>

      <details className="card p-5 sm:p-6 group">
        <summary className="cursor-pointer flex items-center gap-2 select-none list-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-accent/10 text-brand-accent">
            <Plus className="w-4 h-4" />
          </span>
          <span className="text-sm font-semibold text-ink">Add one assignment</span>
          <span className="ml-auto text-xs text-ink-subtle">Click to expand</span>
          <ChevronDown className="w-4 h-4 text-ink-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4">
          <AssignSubjectTeacherForm
            teachers={teachers ?? []}
            classes={classes ?? []}
            subjects={subjects ?? []}
            term={term}
            academicYear={year}
          />
        </div>
      </details>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
          Current assignments
        </h3>
        <AssignmentsBrowser rows={rows} />
      </section>
    </div>
  )
}
