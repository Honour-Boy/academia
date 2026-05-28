import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, BookOpen, UserCheck, UserX, Pencil } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { setStudentActiveAction } from './actions'

export const metadata: Metadata = { title: 'Admin · Students' }

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}

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
        <div className="space-y-5">
          <StudentList title="Active" rows={active} />
          {inactive.length > 0 && <StudentList title="Deactivated" rows={inactive} muted />}
        </div>
      )}
    </div>
  )
}

function StudentList({
  title,
  rows,
  muted = false,
}: {
  title: string
  rows: Array<{ id: string; full_name: string; student_number: string | null; is_active: boolean; className: string | null }>
  muted?: boolean
}) {
  if (!rows.length) return null

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
        {title} · {rows.length}
      </h3>
      <div className="card divide-y divide-surface-border overflow-hidden">
        {rows.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-surface-muted/60 transition-colors">
            <span
              className={
                'inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold text-white flex-shrink-0 ring-1 ring-white/40 shadow-sm ' +
                (muted ? 'bg-slate-300' : 'bg-gradient-to-br from-brand-secondary to-brand-primary')
              }
            >
              {initials(s.full_name)}
            </span>
            <div className="flex-1 min-w-0">
              <p className={'text-sm font-semibold truncate ' + (muted ? 'text-ink-muted line-through' : 'text-ink')}>
                {s.full_name}
              </p>
              <p className="text-xs text-ink-subtle truncate">
                {s.className ?? 'No class assigned'}
                {s.student_number ? ` · #${s.student_number}` : ''}
              </p>
            </div>

            <Link
              href={`/admin/students/${s.id}`}
              aria-label={`Edit ${s.full_name}`}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </Link>

            <form
              action={async () => {
                'use server'
                await setStudentActiveAction(s.id, !s.is_active)
              }}
            >
              <button
                type="submit"
                aria-label={s.is_active ? 'Deactivate' : 'Reactivate'}
                title={s.is_active ? 'Deactivate' : 'Reactivate'}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors"
              >
                {s.is_active ? (
                  <UserX className="w-4 h-4" />
                ) : (
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                )}
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  )
}
