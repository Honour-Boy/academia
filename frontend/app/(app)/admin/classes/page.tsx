import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { GraduationCap, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import EmptyState from '@/components/ui/EmptyState'
import CreateClassDialog from './CreateClassDialog'
import AssignClassTeacherForm from './AssignClassTeacherForm'

export const metadata: Metadata = { title: 'Admin · Classes' }

export default async function ClassesAdminPage() {
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

  const ctaMap: Record<string, { teacher_id: string; name: string }> = {}
  for (const c of ctas ?? []) {
    ctaMap[(c as any).class_id] = {
      teacher_id: (c as any).teacher_id,
      name: (c as any).profiles?.full_name ?? '—',
    }
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
        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {(classes ?? []).map((cls: any) => {
            const current = ctaMap[cls.id] ?? null
            return (
              <div
                key={cls.id}
                className="card p-4 sm:p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-accent/10 text-brand-accent flex-shrink-0">
                      <GraduationCap className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink text-base font-mono">{cls.name}</p>
                      <p className="text-xs text-ink-muted">{cls.level} · Arm {cls.arm}</p>
                    </div>
                  </div>
                  {current ? (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 font-medium px-2 py-1 rounded-full whitespace-nowrap">
                      <Users className="w-3 h-3" /> assigned
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-subtle whitespace-nowrap">unassigned</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Class teacher</p>
                  <AssignClassTeacherForm
                    classId={cls.id}
                    currentTeacherId={current?.teacher_id ?? null}
                    teachers={teachers ?? []}
                    term={term}
                    academicYear={year}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
