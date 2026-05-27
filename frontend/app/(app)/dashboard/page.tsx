import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClassSubjectCard from '@/components/dashboard/ClassSubjectCard'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import { BookOpen, Users } from 'lucide-react'
import Link from 'next/link'

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
  const isAdmin = profile?.role === 'ADMIN'

  // ── Subject-teacher assignments ────────────────────────────────────────────
  const subjectQuery = supabase
    .from('teacher_assignments')
    .select(`
      id, term, academic_year,
      classes(id, name, level, arm),
      subjects(id, name),
      profiles!teacher_assignments_teacher_id_fkey(id, full_name)
    `)
    .eq('term', term)
    .eq('academic_year', year)

  if (!isAdmin) subjectQuery.eq('teacher_id', user.id)

  const { data: subjectAssignments } = await subjectQuery

  // ── Class-teacher assignments ──────────────────────────────────────────────
  const ctQuery = supabase
    .from('class_teacher_assignments')
    .select(`
      id, term, academic_year,
      classes(id, name, level, arm),
      profiles!teacher_id(id, full_name)
    `)
    .eq('term', term)
    .eq('academic_year', year)

  if (!isAdmin) ctQuery.eq('teacher_id', user.id)

  const { data: classTeacherAssignments } = await ctQuery

  // ── Enrich subject assignments with student counts ─────────────────────────
  const enrichedSubject = await Promise.all(
    (subjectAssignments ?? []).map(async (a: any) => {
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
    }),
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">
          {isAdmin ? 'All Assignments' : `Welcome, ${profile?.full_name?.split(' ')[0]}`}
        </h1>
        <p className="text-ink-muted text-sm mt-0.5">{term} · {year}</p>
      </div>

      {/* ── Class Teacher section ─────────────────────────────────────────── */}
      {(classTeacherAssignments ?? []).length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Class Teacher
          </h2>
          <div className="grid gap-3">
            {(classTeacherAssignments ?? []).map((a: any) => (
              <Link
                key={a.id}
                href={`/class-teacher/${a.classes?.id}?term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`}
                className="card px-4 py-4 flex items-center gap-3 hover:border-brand/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink text-sm">{a.classes?.name}</p>
                  <p className="text-xs text-ink-muted">
                    Attendance · Behaviour · Remarks
                  </p>
                  {isAdmin && a.profiles?.full_name && (
                    <p className="text-xs text-ink-subtle mt-0.5">{a.profiles.full_name}</p>
                  )}
                </div>
                <span className="text-xs bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                  Class Teacher
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Subject Teacher section ───────────────────────────────────────── */}
      {enrichedSubject.length > 0 && (
        <section>
          {(classTeacherAssignments ?? []).length > 0 && (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Subject Teacher
            </h2>
          )}
          <div className="grid gap-3">
            {enrichedSubject.map((a: any) => (
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
        </section>
      )}

      {/* Empty state */}
      {enrichedSubject.length === 0 && (classTeacherAssignments ?? []).length === 0 && (
        <div className="card p-10 flex flex-col items-center text-center gap-3">
          <BookOpen className="w-10 h-10 text-ink-subtle" />
          <p className="font-medium text-ink">No assignments yet</p>
          <p className="text-ink-muted text-sm">
            {isAdmin
              ? 'Go to Admin → Classes to assign class teachers, or Admin → Assignments to assign subjects.'
              : 'Ask your administrator to assign you to a class.'}
          </p>
          {isAdmin && <Link href="/admin" className="btn-primary mt-2">Go to Admin</Link>}
        </div>
      )}
    </div>
  )
}
