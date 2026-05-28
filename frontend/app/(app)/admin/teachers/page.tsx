import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, Users, Mail, ShieldCheck } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import DeactivateTeacherButton from './DeactivateTeacherButton'

export const metadata: Metadata = { title: 'Admin · Teachers' }

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}

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
        <div className="space-y-5">
          <TeacherList title="Active" rows={active} />
          {inactive.length > 0 && <TeacherList title="Deactivated" rows={inactive} muted />}
        </div>
      )}
    </div>
  )
}

function TeacherList({
  title,
  rows,
  muted = false,
}: {
  title: string
  rows: Array<{ id: string; full_name: string; email: string; role: string; is_active: boolean }>
  muted?: boolean
}) {
  if (!rows.length) return null
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
        {title} · {rows.length}
      </h3>
      <div className="card divide-y divide-surface-border overflow-hidden">
        {rows.map((t) => {
          const isAdmin = t.role === 'ADMIN'
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 sm:px-5 py-4 hover:bg-surface-muted/60 transition-colors">
              <span
                className={
                  'inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold text-white flex-shrink-0 ring-1 ring-white/40 shadow-sm ' +
                  (muted
                    ? 'bg-slate-300'
                    : isAdmin
                      ? 'bg-gradient-to-br from-brand-primary to-brand-secondary'
                      : 'bg-gradient-to-br from-brand-accent to-brand-accent-dark')
                }
              >
                {initials(t.full_name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={'text-sm font-semibold truncate ' + (muted ? 'text-ink-muted line-through' : 'text-ink')}>
                    {t.full_name}
                  </p>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider bg-brand-primary-light text-brand-primary-dark px-1.5 py-0.5 rounded">
                      <ShieldCheck className="w-3 h-3" /> Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-subtle flex items-center gap-1.5 mt-0.5 truncate">
                  <Mail className="w-3 h-3 flex-shrink-0" /> {t.email}
                </p>
              </div>
              <DeactivateTeacherButton teacherId={t.id} isActive={t.is_active} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
