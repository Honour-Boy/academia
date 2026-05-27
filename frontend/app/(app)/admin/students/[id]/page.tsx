import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import EditStudentForm from './EditStudentForm'

export const metadata: Metadata = { title: 'Edit Student' }

interface Props { params: { id: string } }

export default async function EditStudentPage({ params }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const term = currentTerm()
  const year = currentAcademicYear()

  const [
    { data: student },
    { data: classes },
    { data: subjects },
    { data: enrolled },
    { data: ctas },
  ] = await Promise.all([
    supabase
      .from('students')
      .select('*, classes(id, name)')
      .eq('id', params.id)
      .single(),
    supabase.from('classes').select('*').order('name'),
    supabase.from('subjects').select('*').order('name'),
    supabase
      .from('student_subjects')
      .select('subject_id')
      .eq('student_id', params.id),
    supabase
      .from('class_teacher_assignments')
      .select('class_id, profiles!teacher_id(full_name)')
      .eq('term', term)
      .eq('academic_year', year),
  ])

  if (!student) notFound()

  const enrolledSubjectIds = (enrolled ?? []).map((e: { subject_id: string }) => e.subject_id)
  const ctaMap: Record<string, string | null> = {}
  for (const cta of ctas ?? []) ctaMap[(cta as any).class_id] = (cta as any).profiles?.full_name ?? null

  const enrichedClasses = (classes ?? []).map((c) => ({
    ...c,
    classTeacherName: ctaMap[c.id] ?? null,
  }))

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/students" className="btn-ghost p-2 -ml-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-semibold text-ink text-xl">Edit Student</h1>
      </div>

      <div className="card p-5">
        <EditStudentForm
          studentId={params.id}
          defaultName={student.full_name}
          defaultStudentNumber={student.student_number ?? ''}
          defaultClassId={student.class_id}
          classes={enrichedClasses}
          subjects={subjects ?? []}
          enrolledSubjectIds={enrolledSubjectIds}
        />
      </div>
    </div>
  )
}
