import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSchoolSettings } from '@/lib/school-settings'
import ClassTeacherSheet from '@/components/grades/ClassTeacherSheet'
import type { StudentRemark } from '@/types'

interface Props {
  params: { classId: string }
  searchParams: { term?: string; year?: string }
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Class Teacher Sheet' }
}

export default async function ClassTeacherPage({ params, searchParams }: Props) {
  const { classId } = params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const settings = await getSchoolSettings()
  const term = searchParams.term ?? settings.currentTerm
  const year = searchParams.year ?? settings.currentAcademicYear

  const { data: cta } = await supabase
    .from('class_teacher_assignments')
    .select('id')
    .eq('teacher_id', user.id)
    .eq('class_id', classId)
    .eq('term', term)
    .eq('academic_year', year)
    .maybeSingle()

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (!cta && profile?.role !== 'ADMIN') notFound()

  const [
    { data: classData },
    { data: students },
    { data: remarks },
  ] = await Promise.all([
    supabase.from('classes').select('*').eq('id', classId).single(),
    supabase.from('students').select('*').eq('class_id', classId).eq('is_active', true).order('full_name'),
    supabase
      .from('student_remarks')
      .select('*')
      .eq('class_id', classId)
      .eq('term', term)
      .eq('academic_year', year),
  ])

  if (!classData) notFound()

  const remarkMap: Record<string, StudentRemark> = {}
  for (const r of remarks ?? []) remarkMap[r.student_id] = r as StudentRemark

  const filled = Object.keys(remarkMap).length
  const total = students?.length ?? 0
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0

  return (
    <div className="max-w-3xl mx-auto w-full animate-fade-in-up">
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
              {classData.name}
            </h1>
            <p className="text-ink-muted text-xs mt-0.5">
              Class teacher sheet · {term} · {year}
            </p>
          </div>
          <div className="flex-shrink-0 text-right hidden sm:block">
            <p className="text-sm font-bold text-ink font-mono">{filled}/{total}</p>
            <p className="text-[10px] uppercase tracking-wider text-ink-subtle mt-0.5">Filled</p>
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-3">
          <div className="h-1.5 bg-surface-border/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-4">
        <div className="rounded-xl bg-brand-secondary-light border border-brand-secondary/30 px-3 py-2.5 flex gap-2.5">
          <Info className="w-4 h-4 text-brand-secondary-dark flex-shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm text-brand-accent-dark">
            As class teacher you record attendance, behaviour, and remarks for each student. Subject scores belong to the subject teachers.
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4">
        <ClassTeacherSheet
          students={students ?? []}
          remarks={remarkMap}
          classId={classId}
          term={term}
          academicYear={year}
        />
      </div>
    </div>
  )
}
