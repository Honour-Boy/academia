import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GradeEntryList from '@/components/grades/GradeEntryList'
import { computeClassRows, classStats, currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import type { Grade, ScoreComponent, Student } from '@/types'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface Props {
  params: { classId: string; subjectId: string }
  searchParams: { term?: string; year?: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: 'Grade Entry' }
}

export default async function GradeEntryPage({ params, searchParams }: Props) {
  const { classId, subjectId } = params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const term = searchParams.term ?? currentTerm()
  const year = searchParams.year ?? currentAcademicYear()

  // Verify user has access to this class+subject (RLS will also enforce this, but fail fast)
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

  // Fetch all data in parallel
  const [
    { data: classData },
    { data: subjectData },
    { data: students },
    { data: grades },
    { data: components },
  ] = await Promise.all([
    supabase.from('classes').select('*').eq('id', classId).single(),
    supabase.from('subjects').select('*').eq('id', subjectId).single(),
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

  if (!classData || !subjectData) notFound()

  const rows = computeClassRows(
    (students ?? []) as Student[],
    (grades ?? []) as Grade[],
    (components ?? []) as ScoreComponent[]
  )
  const stats = classStats(rows)

  return (
    <div className="max-w-2xl mx-auto px-0 sm:px-4">
      {/* Header */}
      <div className="sticky top-16 z-40 bg-surface-muted border-b border-surface-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" aria-label="Back" className="btn-ghost p-2 -ml-1">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-ink text-base leading-tight truncate">
              {subjectData.name}
            </h1>
            <p className="text-ink-muted text-xs mt-0.5">{classData.name} · {term} · {year}</p>
          </div>
          {/* Stats chip */}
          <div className="flex-shrink-0 text-right">
            <p className="text-xs font-medium text-ink">
              {stats.graded}/{stats.total}
            </p>
            <p className="text-xs text-ink-muted">
              avg {stats.average > 0 ? `${stats.average}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Grade entry list */}
      <GradeEntryList
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
