import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, Users } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { getSchoolSettings } from '@/lib/school-settings'
import TeachersBrowser, { type TeacherRow } from './TeachersBrowser'

export const metadata: Metadata = { title: 'Admin · Teachers' }

export default async function TeachersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { currentTerm: term, currentAcademicYear: year } = await getSchoolSettings()

  const [
    { data: teachers },
    { data: subjectAssignments },
    { data: classTeacherAssignments },
    { data: registeredSubjects },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, created_at')
      .in('role', ['TEACHER', 'ADMIN'])
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('full_name'),
    supabase
      .from('teacher_assignments')
      .select('teacher_id, subjects!subject_id(id, name), classes!class_id(id, name)')
      .eq('term', term)
      .eq('academic_year', year),
    supabase
      .from('class_teacher_assignments')
      .select('teacher_id, classes!class_id(id, name)')
      .eq('term', term)
      .eq('academic_year', year),
    // Subjects each staff member declared at registration. Useful even when
    // they don't yet have current-term assignments — tells the admin what the
    // teacher *can* teach, not just what they *do* teach this term.
    supabase
      .from('staff_subject_requests')
      .select('profile_id, subjects!subject_id(id, name)'),
  ])

  // Roll the three side queries into per-teacher buckets.
  type SubjectClassPair = { subjectId: string; subjectName: string; classId: string; className: string }
  const subjectPairsByTeacher = new Map<string, SubjectClassPair[]>()
  for (const a of subjectAssignments ?? []) {
    const teacherId = (a as any).teacher_id as string
    const s = (a as any).subjects
    const c = (a as any).classes
    if (!s || !c) continue
    const list = subjectPairsByTeacher.get(teacherId) ?? []
    list.push({ subjectId: s.id, subjectName: s.name, classId: c.id, className: c.name })
    subjectPairsByTeacher.set(teacherId, list)
  }

  const classTeacherByTeacher = new Map<string, { classId: string; className: string }>()
  for (const a of classTeacherAssignments ?? []) {
    const teacherId = (a as any).teacher_id as string
    const c = (a as any).classes
    if (!c) continue
    classTeacherByTeacher.set(teacherId, { classId: c.id, className: c.name })
  }

  const registeredByTeacher = new Map<string, { id: string; name: string }[]>()
  for (const r of registeredSubjects ?? []) {
    const profileId = (r as any).profile_id as string
    const s = (r as any).subjects
    if (!s) continue
    const list = registeredByTeacher.get(profileId) ?? []
    list.push({ id: s.id, name: s.name })
    registeredByTeacher.set(profileId, list)
  }

  // Count active admins so the button can disable self-deactivation when this
  // admin is the only one. Server-side action also enforces this.
  const activeAdminCount = (teachers ?? []).filter((t) => t.role === 'ADMIN' && t.is_active).length

  const rows: TeacherRow[] = (teachers ?? []).map((t) => {
    const pairs = subjectPairsByTeacher.get(t.id) ?? []
    // Group classes by subject so "Maths: JSS 1A, JSS 1B" reads naturally.
    const grouped = new Map<string, { subjectName: string; classes: string[] }>()
    for (const p of pairs) {
      const g = grouped.get(p.subjectId)
      if (g) g.classes.push(p.className)
      else grouped.set(p.subjectId, { subjectName: p.subjectName, classes: [p.className] })
    }
    return {
      id: t.id,
      full_name: t.full_name,
      email: t.email,
      role: t.role,
      is_active: t.is_active,
      teaches: Array.from(grouped.values())
        .map((g) => ({ subject: g.subjectName, classes: g.classes.sort() }))
        .sort((a, b) => a.subject.localeCompare(b.subject)),
      classTeacherOf: classTeacherByTeacher.get(t.id)?.className ?? null,
      registeredSubjects: (registeredByTeacher.get(t.id) ?? [])
        .map((s) => s.name)
        .sort(),
    }
  })

  const active = rows.filter((t) => t.is_active)
  const inactive = rows.filter((t) => !t.is_active)

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Teachers &amp; admins</h2>
          <p className="text-sm text-ink-muted mt-1">
            Manage staff accounts. {active.length} active · {inactive.length} deactivated.
            <span className="text-ink-subtle"> · Showing assignments for {term} · {year}.</span>
          </p>
        </div>
        <Link href="/admin/teachers/new" className="btn-brand">
          <Plus className="w-4 h-4" /> Add teacher
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff yet"
          description="Add your first teacher, or wait for self-registrations to land in the approval queue."
          primaryAction={{ label: 'Add a teacher', href: '/admin/teachers/new' }}
        />
      ) : (
        <TeachersBrowser
          rows={rows}
          currentUserId={user.id}
          activeAdminCount={activeAdminCount}
        />
      )}
    </div>
  )
}
