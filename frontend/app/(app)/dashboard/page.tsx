import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClassSubjectCard from '@/components/dashboard/ClassSubjectCard'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import { BookOpen } from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const term = currentTerm()
  const year = currentAcademicYear()

  // Admin → show all assignments; Teacher → show own
  const assignmentsQuery = supabase
    .from('teacher_assignments')
    .select(`
      id, term, academic_year,
      classes(id, name, level, arm),
      subjects(id, name),
      profiles!teacher_assignments_teacher_id_fkey(id, full_name)
    `)
    .eq('term', term)
    .eq('academic_year', year)

  if (profile?.role === 'TEACHER') {
    assignmentsQuery.eq('teacher_id', user.id)
  }

  const { data: assignments } = await assignmentsQuery

  // For each assignment, count total students and graded students
  const enriched = await Promise.all(
    (assignments ?? []).map(async (a: any) => {
      const classId   = a.classes?.id
      const subjectId = a.subjects?.id

      const [{ count: totalStudents }, { count: gradedStudents }] = await Promise.all([
        supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', classId)
          .eq('is_active', true),
        supabase
          .from('grades')
          .select('student_id', { count: 'exact', head: true })
          .eq('class_id', classId)
          .eq('subject_id', subjectId)
          .eq('term', term)
          .eq('academic_year', year)
          .not('score', 'is', null),
      ])

      return { ...a, totalStudents: totalStudents ?? 0, gradedStudents: gradedStudents ?? 0 }
    })
  )

  const isAdmin = profile?.role === 'ADMIN'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">
          {isAdmin ? 'All Assignments' : `Welcome, ${profile?.full_name?.split(' ')[0]}`}
        </h1>
        <p className="text-ink-muted text-sm mt-0.5">{term} · {year}</p>
      </div>

      {/* Assignment cards */}
      {enriched.length === 0 ? (
        <div className="card p-10 flex flex-col items-center text-center gap-3">
          <BookOpen className="w-10 h-10 text-ink-subtle" />
          <p className="font-medium text-ink">No assignments yet</p>
          <p className="text-ink-muted text-sm">
            {isAdmin
              ? 'Go to Admin → Teachers to assign subjects to classes.'
              : 'Ask your administrator to assign you to a class and subject.'}
          </p>
          {isAdmin && (
            <a href="/admin" className="btn-primary mt-2">Go to Admin</a>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {enriched.map((a: any) => (
            <ClassSubjectCard
              key={a.id}
              classId={a.classes?.id}
              subjectId={a.subjects?.id}
              className={a.classes?.name}
              subjectName={a.subjects?.name}
              teacherName={isAdmin ? a.profiles?.full_name : undefined}
              totalStudents={a.totalStudents}
              gradedStudents={a.gradedStudents}
              term={a.term}
              academicYear={a.academic_year}
            />
          ))}
        </div>
      )}
    </div>
  )
}
