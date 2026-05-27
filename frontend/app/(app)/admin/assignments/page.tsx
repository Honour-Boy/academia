import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import AssignSubjectTeacherForm from './AssignSubjectTeacherForm'
import RemoveAssignmentButton from './RemoveAssignmentButton'

export const metadata: Metadata = { title: 'Subject Assignments' }

export default async function AssignmentsAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const term = currentTerm()
  const year = currentAcademicYear()

  const [
    { data: teachers },
    { data: classes },
    { data: subjects },
    { data: assignments },
  ] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'TEACHER').eq('is_active', true).order('full_name'),
    supabase.from('classes').select('id, name').order('name'),
    supabase.from('subjects').select('id, name').order('name'),
    supabase
      .from('teacher_assignments')
      .select('id, profiles!teacher_id(full_name), classes!class_id(name), subjects!subject_id(name)')
      .eq('term', term)
      .eq('academic_year', year)
      .order('created_at', { ascending: false }),
  ])

  const rows = (assignments ?? []).map((a) => ({
    id: (a as any).id as string,
    teacherName: (a as any).profiles?.full_name ?? '—',
    className: (a as any).classes?.name ?? '—',
    subjectName: (a as any).subjects?.name ?? '—',
  }))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="btn-ghost p-2 -ml-2"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="font-semibold text-ink text-xl">Subject Assignments</h1>
          <p className="text-xs text-ink-muted">{term} · {year}</p>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-ink mb-3">Assign a subject teacher</h2>
        <AssignSubjectTeacherForm
          teachers={teachers ?? []}
          classes={classes ?? []}
          subjects={subjects ?? []}
          term={term}
          academicYear={year}
        />
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
        Current assignments · {rows.length}
      </h2>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-ink-muted">No subject teachers assigned yet for this term.</p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{r.teacherName}</p>
                <p className="text-xs text-ink-subtle">
                  {r.subjectName} · {r.className}
                </p>
              </div>
              <RemoveAssignmentButton assignmentId={r.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
