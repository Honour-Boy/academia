import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import EnrollStudentForm from './EnrollStudentForm'

export const metadata: Metadata = { title: 'Enroll Student' }

export default async function EnrollStudentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const term = currentTerm()
  const year = currentAcademicYear()

  const [
    { data: classes },
    { data: subjects },
    { data: classTeacherAssignments },
  ] = await Promise.all([
    supabase.from('classes').select('*').order('name'),
    supabase.from('subjects').select('*').order('name'),
    supabase
      .from('class_teacher_assignments')
      .select('class_id, profiles!teacher_id(full_name)')
      .eq('term', term)
      .eq('academic_year', year),
  ])

  // Enrich classes with class teacher name
  const ctaMap: Record<string, string | null> = {}
  for (const cta of classTeacherAssignments ?? []) {
    ctaMap[cta.class_id] = (cta as any).profiles?.full_name ?? null
  }

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
        <h1 className="font-semibold text-ink text-xl">Enroll Student</h1>
      </div>

      <div className="card p-5">
        <EnrollStudentForm
          classes={enrichedClasses}
          subjects={subjects ?? []}
          defaultTerm={term}
          defaultYear={year}
        />
      </div>
    </div>
  )
}
