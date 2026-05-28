import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/ui/EmptyState'
import AuditByStudent from './AuditByStudent'

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
      grades!grade_id ( student_id, students!student_id ( full_name ), subjects!subject_id ( name ) )
    `)
    .order('changed_at', { ascending: false })
    .limit(200)

  const entries = (log ?? []).map((e) => ({
    id: (e as any).id as string,
    who: ((e as any).changed_by_name ?? 'Unknown') as string,
    action: (e as any).action as 'INSERT' | 'UPDATE',
    oldScore: (e as any).old_score as number | null,
    newScore: (e as any).new_score as number | null,
    changedAt: (e as any).changed_at as string,
    studentId: ((e as any).grades?.student_id ?? null) as string | null,
    student: ((e as any).grades?.students?.full_name ?? 'Unknown student') as string,
    subject: ((e as any).grades?.subjects?.name ?? 'Unknown subject') as string,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Grade audit log</h2>
        <p className="text-sm text-ink-muted mt-1">
          Every grade insert and update is logged here. Showing the most recent 200 changes, grouped by student.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="No grade changes recorded yet"
          description="Once teachers start entering or updating scores, every change will appear here."
        />
      ) : (
        <AuditByStudent entries={entries} />
      )}
    </div>
  )
}
