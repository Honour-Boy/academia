import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ArrowRight, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/ui/EmptyState'

export const metadata: Metadata = { title: 'Admin · Audit log' }

// Always render fresh — an audit log must reflect the latest writes.
export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { data: log } = await supabase
    .from('grade_audit_log')
    .select(`
      id, changed_by_name, old_score, new_score, action, changed_at,
      grades!grade_id ( students!student_id ( full_name ), subjects!subject_id ( name ) )
    `)
    .order('changed_at', { ascending: false })
    .limit(200)

  const entries = (log ?? []).map((e) => ({
    id: (e as any).id as string,
    who: (e as any).changed_by_name ?? 'Unknown',
    action: (e as any).action as 'INSERT' | 'UPDATE',
    oldScore: (e as any).old_score as number | null,
    newScore: (e as any).new_score as number | null,
    changedAt: (e as any).changed_at as string,
    student: (e as any).grades?.students?.full_name ?? 'Unknown student',
    subject: (e as any).grades?.subjects?.name ?? 'Unknown subject',
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Grade audit log</h2>
        <p className="text-sm text-ink-muted mt-1">
          Every grade insert and update is logged here. Showing the most recent 200 changes.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="No grade changes recorded yet"
          description="Once teachers start entering or updating scores, every change will appear here."
        />
      ) : (
        <div className="card divide-y divide-surface-border overflow-hidden">
          {entries.map((e) => (
            <div key={e.id} className="px-4 sm:px-5 py-3.5 hover:bg-surface-muted/60 transition-colors">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <p className="text-sm font-semibold text-ink truncate">
                  {e.student}
                  <span className="text-ink-muted font-normal"> · {e.subject}</span>
                </p>
                <span
                  className={
                    'inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ' +
                    (e.action === 'INSERT'
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'bg-brand-secondary-light text-brand-secondary-dark ring-1 ring-brand-secondary/30')
                  }
                >
                  {e.action}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm font-mono text-ink">
                <span className="text-ink-subtle">{e.oldScore ?? '—'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-ink-subtle" />
                <span className="font-bold">{e.newScore ?? '—'}</span>
              </div>
              <p className="text-xs text-ink-subtle mt-1.5">
                {e.who} · {new Date(e.changedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
