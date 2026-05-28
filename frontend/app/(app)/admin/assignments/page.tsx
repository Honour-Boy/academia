import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Network, BookOpen, GraduationCap, User, Plus, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import EmptyState from '@/components/ui/EmptyState'
import AssignSubjectTeacherForm from './AssignSubjectTeacherForm'
import RemoveAssignmentButton from './RemoveAssignmentButton'
import AssignmentMatrix from './AssignmentMatrix'

export const metadata: Metadata = { title: 'Admin · Subject Assignments' }

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
      .select('id, teacher_id, class_id, subject_id, profiles!teacher_id(full_name), classes!class_id(name), subjects!subject_id(name)')
      .eq('term', term)
      .eq('academic_year', year)
      .order('created_at', { ascending: false }),
  ])

  const rawAssignments = (assignments ?? []).map((a: any) => ({
    id: a.id as string,
    teacher_id: a.teacher_id as string,
    class_id: a.class_id as string,
    subject_id: a.subject_id as string,
  }))

  const rows = (assignments ?? []).map((a: any) => ({
    id: a.id as string,
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Current assignments
          </h3>
          {rows.length > 0 && (
            <span className="text-xs font-medium text-ink-muted">{rows.length}</span>
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Network}
            title="Nothing assigned yet"
            description="Use the matrix above to bulk-assign a teacher to multiple subject × class cells, then come back here for the per-row view."
          />
        ) : (
          <div className="card divide-y divide-surface-border overflow-hidden">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-surface-muted/60 transition-colors">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-brand-accent/10 text-brand-accent flex-shrink-0">
                  <User className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{r.teacherName}</p>
                  <p className="text-xs text-ink-muted flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />{r.subjectName}
                    </span>
                    <span className="text-ink-subtle">·</span>
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="w-3 h-3" />{r.className}
                    </span>
                  </p>
                </div>
                <RemoveAssignmentButton assignmentId={r.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
