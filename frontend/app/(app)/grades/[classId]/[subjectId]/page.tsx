import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GradeEntryGrid from '@/components/grades/GradeEntryGrid'
import { computeClassRows, classStats } from '@/lib/grade-utils'
import { getGradingScale } from '@/lib/grading-scale-server'
import { getSchoolSettings } from '@/lib/school-settings'
import type { Grade, ScoreComponent, Student } from '@/types'
import Link from 'next/link'
import { ChevronLeft, Users, BookX } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'

interface Props {
  params: { classId: string; subjectId: string }
  searchParams: { term?: string; year?: string }
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Grade Entry' }
}

export default async function GradeEntryPage({ params, searchParams }: Props) {
  const { classId, subjectId } = params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const settings = await getSchoolSettings()
  const term = searchParams.term ?? settings.currentTerm
  const year = searchParams.year ?? settings.currentAcademicYear

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'TEACHER') {
    // Use maybeSingle() with no row limit fanout — a teacher can legitimately
    // have multiple assignments for the same (class, subject) across terms
    // after a term carry-forward. The OLD .single() call errored out with
    // "JSON object requested, multiple rows" and silently rendered notFound(),
    // which the user saw as a "blank" grade-entry page. `.limit(1)` collapses
    // to at most one row; any match means they're authorised to be here.
    const { data: assignment } = await supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .limit(1)
      .maybeSingle()

    if (!assignment) notFound()
  }

  const [
    { data: classData },
    { data: subjectData },
    { data: classStudents },
    { data: grades },
    { data: components },
  ] = await Promise.all([
    supabase.from('classes').select('*').eq('id', classId).single(),
    supabase.from('subjects').select('*').eq('id', subjectId).single(),
    // Pull the class roster up-front so we can scope the enrolment lookup to
    // students in THIS class (not the global enrolment set for the subject).
    // Previously, if any student elsewhere took this subject, the .in(id, …)
    // filter excluded class students who hadn't been explicitly enrolled —
    // resulting in a blank grade-entry sheet ("subjects show blank").
    supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('grades')
      .select('*')
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .eq('term', term)
      .eq('academic_year', year),
    supabase
      .from('score_components')
      .select('*')
      .order('sort_order'),
  ])

  const classStudentIds = (classStudents ?? []).map((s: { id: string }) => s.id)

  // Now scope the enrolment check to just THIS class. If any class student is
  // enrolled in this subject, we filter down to enrolees. If NO class student
  // is enrolled (admins skipped subject pick on enrolment), fall back to the
  // full roster — same forgiving behaviour as before, just correctly scoped.
  let enrolledIds: string[] = []
  if (classStudentIds.length > 0) {
    const { data: enrollments } = await supabase
      .from('student_subjects')
      .select('student_id')
      .eq('subject_id', subjectId)
      .in('student_id', classStudentIds)
    enrolledIds = (enrollments ?? []).map((e: { student_id: string }) => e.student_id)
  }

  // Three states for the roster:
  //   - some students in this class are enrolled in this subject → show those
  //   - none of the class students are enrolled in this subject → empty state
  //     (admin needs to add the subject to those students)
  //   - the class has no active students at all → different empty state
  const classHasNoStudents = classStudentIds.length === 0
  const noOneEnrolledInSubject = !classHasNoStudents && enrolledIds.length === 0
  const students = enrolledIds.length > 0
    ? (classStudents ?? []).filter((s: { id: string }) => enrolledIds.includes(s.id))
    : []

  if (!classData || !subjectData) notFound()

  const scale = await getGradingScale()
  const rows = computeClassRows(
    (students ?? []) as Student[],
    (grades ?? []) as Grade[],
    (components ?? []) as ScoreComponent[],
    scale,
  )
  const stats = classStats(rows)
  const pct = stats.total > 0 ? Math.round((stats.graded / stats.total) * 100) : 0

  return (
    <div className="max-w-5xl mx-auto w-full animate-fade-in-up">
      <div className="sticky top-[68px] z-40 bg-white/90 backdrop-blur-md border-b border-surface-border">
        <span aria-hidden="true" className="block h-0.5 bg-gradient-to-r from-brand-accent via-brand-primary to-brand-secondary" />
        <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors -ml-2"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-ink text-base sm:text-lg leading-tight truncate">
              {subjectData.name}
              <span className="ml-2 text-[11px] font-mono font-medium text-brand-accent bg-brand-accent/10 px-1.5 py-0.5 rounded align-middle">
                {classData.name}
              </span>
            </h1>
            <p className="text-ink-muted text-xs mt-0.5">{term} · {year}</p>
          </div>
          <div className="flex-shrink-0 text-right hidden sm:block">
            <p className="text-sm font-bold text-ink font-mono">
              {stats.average > 0 ? `${stats.average}%` : '—'}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-ink-subtle mt-0.5">Class avg</p>
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-surface-border/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] font-mono font-semibold text-ink-muted flex-shrink-0">
            {stats.graded}/{stats.total}
          </p>
        </div>
      </div>

      {classHasNoStudents ? (
        <EmptyState
          icon={Users}
          title="No active students in this class"
          description={`${classData.name} has no active students yet. Ask an admin to enrol students from /admin/students.`}
        />
      ) : noOneEnrolledInSubject ? (
        <EmptyState
          icon={BookX}
          title="No students enrolled in this subject"
          description={`${classData.name} has ${classStudentIds.length} active student${classStudentIds.length === 1 ? '' : 's'}, but none of them are enrolled in ${subjectData.name}. An admin needs to add ${subjectData.name} to a student's subject list on /admin/students/[id] before you can grade them.`}
        />
      ) : (
        <GradeEntryGrid
          rows={rows}
          components={(components ?? []) as ScoreComponent[]}
          classId={classId}
          subjectId={subjectId}
          term={term}
          academicYear={year}
        />
      )}
    </div>
  )
}
