import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import AssignClassTeacherForm from './AssignClassTeacherForm'

export const metadata: Metadata = { title: 'Classes & Class Teachers' }

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
    supabase.from('classes').select('*').order('name'),
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="btn-ghost p-2 -ml-2"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="font-semibold text-ink text-xl">Classes &amp; Class Teachers</h1>
          <p className="text-xs text-ink-muted">{term} · {year}</p>
        </div>
      </div>

      <div className="card divide-y divide-surface-border">
        {(classes ?? []).map((cls) => {
          const current = ctaMap[cls.id] ?? null
          return (
            <div key={cls.id} className="px-4 py-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink text-sm">{cls.name}</p>
                  <p className="text-xs text-ink-subtle">{cls.level}</p>
                </div>
                {current ? (
                  <span className="text-xs bg-brand/10 text-brand-dark font-medium px-2 py-1 rounded-full">
                    {current.name}
                  </span>
                ) : (
                  <span className="text-xs text-ink-subtle">No class teacher</span>
                )}
              </div>
              <AssignClassTeacherForm
                classId={cls.id}
                currentTeacherId={current?.teacher_id ?? null}
                teachers={teachers ?? []}
                term={term}
                academicYear={year}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
