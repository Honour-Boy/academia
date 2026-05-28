import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import EnrollStudentForm from './EnrollStudentForm'

export const metadata: Metadata = { title: 'Admin · Enrol Student' }

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

  const ctaMap: Record<string, string | null> = {}
  for (const cta of classTeacherAssignments ?? []) {
    ctaMap[cta.class_id] = (cta as any).profiles?.full_name ?? null
  }

  const enrichedClasses = (classes ?? []).map((c) => ({
    ...c,
    classTeacherName: ctaMap[c.id] ?? null,
  }))

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link
        href="/admin/students"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-primary transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to students
      </Link>

      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-secondary-light text-brand-secondary-dark">
          <UserPlus className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Enrol student</h2>
          <p className="text-sm text-ink-muted mt-0.5">
            Capture name, class, and which subjects this student takes.
          </p>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
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
