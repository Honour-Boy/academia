import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { GraduationCap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSchoolSettings } from '@/lib/school-settings'
import EmptyState from '@/components/ui/EmptyState'
import CreateClassDialog from './CreateClassDialog'
import ClassTeacherMatrix from './ClassTeacherMatrix'

export const metadata: Metadata = { title: 'Admin · Classes' }

export default async function ClassesAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { currentTerm: term, currentAcademicYear: year } = await getSchoolSettings()

  const [
    { data: classes },
    { data: teachers },
    { data: ctas },
  ] = await Promise.all([
    supabase.from('classes').select('id, name, level, arm').order('level').order('arm'),
    supabase.from('profiles').select('id, full_name').eq('role', 'TEACHER').eq('is_active', true).order('full_name'),
    supabase
      .from('class_teacher_assignments')
      .select('class_id, teacher_id, profiles!teacher_id(full_name)')
      .eq('term', term)
      .eq('academic_year', year),
  ])

  const initialAssignments: Record<string, string> = {}
  for (const c of ctas ?? []) {
    initialAssignments[(c as any).class_id] = (c as any).teacher_id
  }

  const hasClasses = (classes ?? []).length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Classes</h2>
          <p className="text-sm text-ink-muted mt-1">
            Create classes and assign class (homeroom) teachers for <span className="font-medium text-ink">{term} · {year}</span>.
          </p>
          <p className="text-xs text-ink-subtle mt-1">
            A teacher can hold only one class-teacher slot per term, so teachers already assigned elsewhere are hidden from other dropdowns. Use <span className="font-semibold">Assign all</span> to save multiple edits at once.
          </p>
        </div>
        <CreateClassDialog />
      </div>

      {/* Class list */}
      {!hasClasses ? (
        <EmptyState
          icon={GraduationCap}
          title="No classes yet"
          description="Create your first class using the button above. You can add as many JSS / SS arms as you need."
        />
      ) : (
        <ClassTeacherMatrix
          classes={(classes ?? []) as { id: string; name: string; level: string; arm: string }[]}
          teachers={teachers ?? []}
          initialAssignments={initialAssignments}
          term={term}
          academicYear={year}
        />
      )}
    </div>
  )
}
