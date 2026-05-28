import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GradeEntryGrid from '@/components/grades/GradeEntryGrid'
import { computeClassRows, classStats } from '@/lib/grade-utils'
import { getSchoolSettings } from '@/lib/school-settings'
import type { Grade, ScoreComponent, Student } from '@/types'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

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
    const { data: assignment } = await supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .single()

    if (!assignment) notFound()
  }

  const [
    { data: classData },
    { data: subjectData },
    { data: enrollments },
    { data: grades },
    { data: components },
  ] = await Promise.all([
    supabase.from('classes').select('*').eq('id', classId).single(),
    supabase.from('subjects').select('*').eq('id', subjectId).single(),
    supabase.from('student_subjects').select('student_id').eq('subject_id', subjectId),
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

  const enrolledIds = (enrollments ?? []).map((e: { student_id: string }) => e.student_id)

  let studentsQuery = supabase
    .from('students')
    .select('*')
    .eq('class_id', classId)
    .eq('is_active', true)
    .order('full_name')

  if (enrolledIds.length > 0) {
    studentsQuery = studentsQuery.in('id', enrolledIds)
  }

  const { data: students } = await studentsQuery

  if (!classData || !subjectData) notFound()

  const rows = computeClassRows(
    (students ?? []) as Student[],
    (grades ?? []) as Grade[],
    (components ?? []) as ScoreComponent[],
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

      <GradeEntryGrid
        rows={rows}
        components={(components ?? []) as ScoreComponent[]}
        classId={classId}
        subjectId={subjectId}
        term={term}
        academicYear={year}
      />
    </div>
  )
}
