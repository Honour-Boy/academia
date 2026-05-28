import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, BookOpen } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import StudentsBrowser from './StudentsBrowser'

export const metadata: Metadata = { title: 'Admin · Students' }

export default async function StudentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { data: students } = await supabase
    .from('students')
    .select(`
      id, full_name, student_number, is_active, created_at,
      classes(id, name, level, arm)
    `)
    .order('full_name')

  const rows = (students ?? []).map((s) => {
    const cls = s.classes as unknown as { name: string } | { name: string }[] | null
    return {
      id: s.id as string,
      full_name: s.full_name as string,
      student_number: (s.student_number ?? null) as string | null,
      is_active: s.is_active as boolean,
      className: (Array.isArray(cls) ? cls[0]?.name : cls?.name) ?? null,
    }
  })

  const active = rows.filter((s) => s.is_active)
  const inactive = rows.filter((s) => !s.is_active)

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Students</h2>
          <p className="text-sm text-ink-muted mt-1">
            {active.length} active · {inactive.length} deactivated. Enrol students and pick which subjects they take.
          </p>
        </div>
        <Link href="/admin/students/new" className="btn-brand">
          <Plus className="w-4 h-4" /> Enrol student
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No students enrolled yet"
          description="Enrol your first student. You'll pick their class and subject offerings in one step."
          primaryAction={{ label: 'Enrol first student', href: '/admin/students/new' }}
        />
      ) : (
        <StudentsBrowser rows={rows} />
      )}
    </div>
  )
}
