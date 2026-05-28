import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, Users } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import TeachersBrowser from './TeachersBrowser'

export const metadata: Metadata = { title: 'Admin · Teachers' }

export default async function TeachersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_active, created_at')
    .in('role', ['TEACHER', 'ADMIN'])
    .eq('status', 'approved')
    .order('full_name')

  const rows = teachers ?? []
  const active = rows.filter((t) => t.is_active)
  const inactive = rows.filter((t) => !t.is_active)

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Teachers &amp; admins</h2>
          <p className="text-sm text-ink-muted mt-1">
            Manage staff accounts. {active.length} active · {inactive.length} deactivated.
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
        <TeachersBrowser rows={rows} />
      )}
    </div>
  )
}
