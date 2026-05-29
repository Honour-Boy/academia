import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, BookOpen, ChevronRight, Users, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSchoolSettings } from '@/lib/school-settings'
import EmptyState from '@/components/ui/EmptyState'

interface Props {
  params: { subjectId: string }
  searchParams: { term?: string; year?: string }
}

export const metadata: Metadata = { title: 'Subject classes' }

/**
 * /subjects/[subjectId]
 * Lists every class the signed-in teacher teaches this subject in for the
 * active term/year. Click a class → /grades/[classId]/[subjectId].
 *
 * The class-level grading completion is computed the same way the dashboard
 * does it: denominator = students enrolled in the subject; numerator =
 * students with all components filled.
 */
export default async function SubjectClassesPage({ params, searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const settings = await getSchoolSettings()
  const term = searchParams.term ?? settings.currentTerm
  const year = searchParams.year ?? settings.currentAcademicYear

  const subjectId = params.subjectId

  const [
    { data: subject },
    { data: assignments },
    { count: componentCount },
  ] = await Promise.all([
    supabase.from('subjects').select('id, name').eq('id', subjectId).maybeSingle(),
    supabase
      .from('teacher_assignments')
      .select('id, classes(id, name, level, arm)')
      .eq('term', term)
      .eq('academic_year', year)
      .eq('teacher_id', user.id)
      .eq('subject_id', subjectId),
    supabase
      .from('score_components')
      .select('id', { count: 'exact', head: true }),
  ])

  if (!subject) notFound()

  const classes = (assignments ?? [])
    .map((a: any) => a.classes as { id: string; name: string; level: string; arm: string } | null)
    .filter((c): c is { id: string; name: string; level: string; arm: string } => !!c)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Per-class completion: only count students enrolled in this subject.
  const enriched = await Promise.all(classes.map(async (cls) => {
    const [{ data: classStudents }, { data: gradeRows }] = await Promise.all([
      supabase.from('students').select('id').eq('class_id', cls.id).eq('is_active', true),
      supabase
        .from('grades')
        .select('student_id, component_id')
        .eq('class_id', cls.id)
        .eq('subject_id', subjectId)
        .eq('term', term)
        .eq('academic_year', year)
        .not('score', 'is', null),
    ])
    const classStudentIds = (classStudents ?? []).map((s: { id: string }) => s.id)
    let enrolledIds: string[] = classStudentIds
    if (classStudentIds.length > 0) {
      const { data: enrollments } = await supabase
        .from('student_subjects')
        .select('student_id')
        .eq('subject_id', subjectId)
        .in('student_id', classStudentIds)
      const enrolled = (enrollments ?? []).map((e: { student_id: string }) => e.student_id)
      if (enrolled.length > 0) enrolledIds = enrolled
    }
    const enrolledSet = new Set(enrolledIds)
    const total = enrolledIds.length

    const byStudent = new Map<string, Set<string>>()
    for (const g of (gradeRows ?? []) as { student_id: string; component_id: string }[]) {
      if (!enrolledSet.has(g.student_id)) continue
      const set = byStudent.get(g.student_id) ?? new Set<string>()
      set.add(g.component_id)
      byStudent.set(g.student_id, set)
    }
    const compsNeeded = componentCount ?? 0
    const graded = compsNeeded > 0
      ? Array.from(byStudent.values()).filter((s) => s.size >= compsNeeded).length
      : 0

    return { ...cls, total, graded }
  }))

  return (
    <div className="max-w-3xl mx-auto w-full animate-fade-in-up">
      <div className="sticky top-[68px] z-30 bg-white/90 backdrop-blur-md border-b border-surface-border">
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
            <h1 className="font-bold text-ink text-base sm:text-lg leading-tight truncate flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand-primary" />
              {subject.name}
            </h1>
            <p className="text-ink-muted text-xs mt-0.5">{term} · {year}</p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 space-y-3">
        {enriched.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No classes for this subject"
            description="You aren't currently assigned to any class for this subject in the active term."
          />
        ) : (
          <>
            <p className="text-xs uppercase tracking-wider font-semibold text-ink-subtle">
              {enriched.length} class{enriched.length === 1 ? '' : 'es'}
            </p>
            {enriched.map((cls) => {
              const pct = cls.total > 0 ? Math.round((cls.graded / cls.total) * 100) : 0
              const isComplete = cls.total > 0 && cls.graded >= cls.total
              return (
                <Link
                  key={cls.id}
                  href={`/grades/${cls.id}/${subjectId}?term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`}
                  className="card p-4 sm:p-5 flex items-center gap-4 cursor-pointer hover:shadow-md hover:ring-1 hover:ring-brand-primary/20 active:scale-[0.99] transition-all duration-200 group"
                >
                  <span
                    aria-hidden="true"
                    className={
                      'flex-shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl text-white shadow-sm ring-1 ring-white/40 ' +
                      (isComplete
                        ? 'bg-gradient-to-br from-brand-secondary to-brand-secondary-dark'
                        : 'bg-gradient-to-br from-brand-accent to-brand-accent-dark')
                    }
                  >
                    {isComplete ? <CheckCircle2 className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink text-sm sm:text-base font-mono">{cls.name}</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 bg-surface-border/60 rounded-full overflow-hidden">
                        <div
                          className={
                            'h-full rounded-full transition-all duration-500 ease-out ' +
                            (isComplete
                              ? 'bg-gradient-to-r from-brand-secondary to-brand-secondary-dark'
                              : 'bg-gradient-to-r from-brand-primary to-brand-primary-dark')
                          }
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="flex items-center gap-1 text-xs text-ink-muted flex-shrink-0 font-medium">
                        <span className="font-mono">{cls.graded}/{cls.total}</span>
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-subtle group-hover:text-brand-primary transition-colors flex-shrink-0" />
                </Link>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
