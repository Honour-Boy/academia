import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Grade Audit Log' }

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
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="btn-ghost p-2 -ml-2"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="font-semibold text-ink text-xl">Grade Audit Log</h1>
          <p className="text-xs text-ink-muted">Most recent 200 changes</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-ink-muted">No grade changes recorded yet.</p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-border">
          {entries.map((e) => (
            <div key={e.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-sm font-medium text-ink truncate">
                  {e.student} · <span className="text-ink-muted font-normal">{e.subject}</span>
                </p>
                <span
                  className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                    e.action === 'INSERT'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {e.action}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm font-mono text-ink">
                <span className="text-ink-subtle">{e.oldScore ?? '—'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-ink-subtle" />
                <span className="font-semibold">{e.newScore ?? '—'}</span>
              </div>
              <p className="text-xs text-ink-subtle mt-1">
                {e.who} · {new Date(e.changedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
