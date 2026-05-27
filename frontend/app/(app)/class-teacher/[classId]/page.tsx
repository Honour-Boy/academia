import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import ClassTeacherSheet from '@/components/grades/ClassTeacherSheet'
import type { StudentRemark } from '@/types'

interface Props {
  params: { classId: string }
  searchParams: { term?: string; year?: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: 'Class Teacher Sheet' }
}

export default async function ClassTeacherPage({ params, searchParams }: Props) {
  const { classId } = params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const term = searchParams.term ?? currentTerm()
  const year = searchParams.year ?? currentAcademicYear()

  // Verify caller is the class teacher for this class+term+year
  const { data: cta } = await supabase
    .from('class_teacher_assignments')
    .select('id')
    .eq('teacher_id', user.id)
    .eq('class_id', classId)
    .eq('term', term)
    .eq('academic_year', year)
    .maybeSingle()

  // Admins can also view
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

  const filled   = Object.keys(remarkMap).length
  const total    = students?.length ?? 0

  return (
    <div className="max-w-2xl mx-auto px-0 sm:px-4">
      {/* Sticky header */}
      <div className="sticky top-16 z-40 bg-surface-muted border-b border-surface-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="btn-ghost p-2 -ml-1">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-ink text-base leading-tight">
              {classData.name}
            </h1>
            <p className="text-ink-muted text-xs mt-0.5">
              Class Teacher Sheet · {term} · {year}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xs font-medium text-ink">{filled}/{total}</p>
            <p className="text-xs text-ink-muted">filled</p>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="mx-4 mt-4 mb-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 flex gap-2">
        <Users className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          As class teacher you can record attendance, behaviour, and remarks for each student.
          You cannot edit subject scores — those belong to the subject teachers.
        </p>
      </div>

      <div className="px-4 py-3">
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
