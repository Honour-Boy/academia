import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClassSubjectCard from '@/components/dashboard/ClassSubjectCard'
import ClassTeacherCard from '@/components/dashboard/ClassTeacherCard'
import StatCard from '@/components/ui/StatCard'
import EmptyState from '@/components/ui/EmptyState'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import { BookOpen, Users, Activity, Sparkles } from 'lucide-react'

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

  if (profile?.role === 'ADMIN') redirect('/admin')

  const term = currentTerm()
  const year = currentAcademicYear()
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const { data: subjectAssignments } = await supabase
    .from('teacher_assignments')
    .select(`id, term, academic_year,
      classes(id, name, level, arm),
      subjects(id, name)`)
    .eq('term', term)
    .eq('academic_year', year)
    .eq('teacher_id', user.id)

  const { data: classTeacherAssignments } = await supabase
    .from('class_teacher_assignments')
    .select(`id, term, academic_year, classes(id, name, level, arm)`)
    .eq('term', term)
    .eq('academic_year', year)
    .eq('teacher_id', user.id)

  const enrichedSubject = await Promise.all(
    (subjectAssignments ?? []).map(async (a: any) => {
      const classId = a.classes?.id
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

  const subjectCount = enrichedSubject.length
  const classCount = (classTeacherAssignments ?? []).length
  const totalSlots = enrichedSubject.reduce((s, a) => s + a.totalStudents, 0)
  const filledSlots = enrichedSubject.reduce((s, a) => s + a.gradedStudents, 0)
  const completionPct = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0
  const hasAnyAssignment = subjectCount + classCount > 0

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-7 animate-fade-in-up">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-accent via-brand-accent-dark to-brand-primary-dark text-white p-5 sm:p-7 shadow-lg shadow-brand-accent/20">
        <span aria-hidden="true" className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-brand-secondary/20 blur-3xl" />
        <span aria-hidden="true" className="absolute -bottom-12 -left-10 w-44 h-44 rounded-full bg-brand-primary/30 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/70">
            <Sparkles className="w-3.5 h-3.5 text-brand-secondary" />
            <span>{term} · {year}</span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
            Hello, {firstName}.
          </h1>
          <p className="text-white/75 text-sm mt-1.5 max-w-md">
            {hasAnyAssignment
              ? 'Pick up where you left off. Tap any class to record scores, attendance, or remarks.'
              : 'You’ll see your classes and subjects here once an admin assigns you.'}
          </p>
        </div>
      </section>

      {hasAnyAssignment && (
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Subjects assigned" value={subjectCount} icon={BookOpen} tone="crimson" />
          <StatCard label="Classes I lead"   value={classCount}   icon={Users}    tone="navy" />
          <StatCard
            label="Grading complete"
            value={subjectCount > 0 ? `${completionPct}%` : '—'}
            icon={Activity}
            tone="gold"
            hint={subjectCount > 0 ? `${filledSlots} of ${totalSlots} score slots` : undefined}
          />
        </section>
      )}

      {classCount > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
            <Users className="w-3.5 h-3.5" /> Class teacher
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(classTeacherAssignments ?? []).map((a: any) => (
              <ClassTeacherCard
                key={a.id}
                classId={a.classes?.id}
                className={a.classes?.name}
                term={term}
                academicYear={year}
              />
            ))}
          </div>
        </section>
      )}

      {subjectCount > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
            <BookOpen className="w-3.5 h-3.5" /> Subject teacher
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {enrichedSubject.map((a: any) => (
              <ClassSubjectCard
                key={a.id}
                classId={a.classes?.id}
                subjectId={a.subjects?.id}
                className={a.classes?.name}
                subjectName={a.subjects?.name}
                totalStudents={a.totalStudents}
                gradedStudents={a.gradedStudents}
                term={a.term}
                academicYear={a.academic_year}
              />
            ))}
          </div>
        </section>
      )}

      {!hasAnyAssignment && (
        <EmptyState
          icon={BookOpen}
          lottie="/lottie/empty-classroom.json"
          title="Nothing on your plate yet"
          description="Once an admin assigns you to a class or subject, your cards will land here. Reach out if you think this is a mistake."
        />
      )}
    </div>
  )
}
