import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubjectGroupCard from '@/components/dashboard/SubjectGroupCard'
import ClassTeacherCard from '@/components/dashboard/ClassTeacherCard'
import GoToProfileButton from '@/components/dashboard/GoToProfileButton'
import StatCard from '@/components/ui/StatCard'
import EmptyState from '@/components/ui/EmptyState'
import { getSchoolSettings } from '@/lib/school-settings'
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

  const { currentTerm: term, currentAcademicYear: year } = await getSchoolSettings()
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

  // Components count is fixed for the whole school (CA1 / CA2 / Exam = 3).
  // Pull it once so per-subject math has the right denominator.
  const { count: componentCount } = await supabase
    .from('score_components')
    .select('id', { count: 'exact', head: true })

  const enrichedSubject = await Promise.all(
    (subjectAssignments ?? []).map(async (a: any) => {
      const classId = a.classes?.id
      const subjectId = a.subjects?.id

      // Restrict the denominator to students in this class who are actually
      // enrolled in THIS subject (student_subjects). Counting the whole class
      // inflates the total when only some students offer the subject — a
      // teacher with 4 computer kids in a 7-student class was seeing 4/7
      // instead of 4/4. Fall back to "all active students in the class" when
      // no enrolment rows exist for the class so legacy admins who skipped
      // subject pick at enrol time still get a sensible denominator.
      const [{ data: classStudents }, { data: gradeRows }] = await Promise.all([
        supabase
          .from('students')
          .select('id')
          .eq('class_id', classId)
          .eq('is_active', true),
        supabase
          .from('grades')
          .select('student_id, component_id')
          .eq('class_id', classId)
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
      const totalStudents = enrolledIds.length

      // Only count grade rows for students who actually offer the subject; a
      // stale grade row for a student who dropped the subject shouldn't bump
      // the numerator.
      const byStudent = new Map<string, Set<string>>()
      let filledSlots = 0
      for (const g of (gradeRows ?? []) as { student_id: string; component_id: string }[]) {
        if (!enrolledSet.has(g.student_id)) continue
        filledSlots += 1
        const set = byStudent.get(g.student_id) ?? new Set<string>()
        set.add(g.component_id)
        byStudent.set(g.student_id, set)
      }
      const compsNeeded = componentCount ?? 0
      const gradedStudents = compsNeeded > 0
        ? Array.from(byStudent.values()).filter((s) => s.size >= compsNeeded).length
        : 0

      return {
        ...a,
        totalStudents,
        gradedStudents,
        filledSlots,
      }
    }),
  )

  // Group assignments by subject — one compact card per subject in the UI,
  // even if the teacher teaches that subject in multiple classes. Stats are
  // summed across classes.
  type SubjectGroup = {
    subjectId: string
    subjectName: string
    classCount: number
    totalStudents: number
    gradedStudents: number
  }
  const subjectGroupMap = new Map<string, SubjectGroup>()
  for (const a of enrichedSubject) {
    const sid: string | undefined = a.subjects?.id
    const sname: string | undefined = a.subjects?.name
    if (!sid || !sname) continue
    const g = subjectGroupMap.get(sid) ?? {
      subjectId: sid,
      subjectName: sname,
      classCount: 0,
      totalStudents: 0,
      gradedStudents: 0,
    }
    g.classCount += 1
    g.totalStudents += a.totalStudents
    g.gradedStudents += a.gradedStudents
    subjectGroupMap.set(sid, g)
  }
  const subjectGroups = Array.from(subjectGroupMap.values()).sort((a, b) =>
    a.subjectName.localeCompare(b.subjectName),
  )

  const subjectCount = subjectGroups.length
  const classAssignmentCount = enrichedSubject.length
  const classCount = (classTeacherAssignments ?? []).length
  const compsPerSubject = componentCount ?? 0
  // "Score slots" = students × components per subject. Apples-to-apples
  // denominator for the filled-rows numerator.
  const totalSlots = enrichedSubject.reduce((s, a) => s + a.totalStudents * compsPerSubject, 0)
  const filledSlots = enrichedSubject.reduce((s, a) => s + a.filledSlots, 0)
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
          <div className="mt-4 flex flex-wrap gap-2">
            <GoToProfileButton />
          </div>
        </div>
      </section>

      {hasAnyAssignment && (
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            label="Subjects assigned"
            value={subjectCount}
            icon={BookOpen}
            tone="crimson"
            hint={subjectCount > 0 ? `${classAssignmentCount} class assignment${classAssignmentCount === 1 ? '' : 's'}` : undefined}
          />
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
            {subjectGroups.map((g) => (
              <SubjectGroupCard
                key={g.subjectId}
                subjectId={g.subjectId}
                subjectName={g.subjectName}
                classCount={g.classCount}
                totalStudents={g.totalStudents}
                gradedStudents={g.gradedStudents}
                term={term}
                academicYear={year}
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
