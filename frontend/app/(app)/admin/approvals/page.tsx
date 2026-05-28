import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Mail, Phone, BookOpen, Home, ShieldCheck, Inbox } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import ApprovalActions from './ApprovalActions'

export const metadata: Metadata = { title: 'Approval Queue' }

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'ADMIN') redirect('/dashboard')

  // Pending registrations
  const { data: pending } = await admin
    .from('profiles')
    .select('id, full_name, email, phone, role, wants_class_teacher, requested_class_id, created_at')
    .eq('status', 'pending')
    .eq('onboarding_complete', true)
    .order('created_at', { ascending: true })

  const rows = pending ?? []
  const ids = rows.map((r) => r.id)

  // Their requested subjects + class names (single round-trip each)
  const [{ data: subjectReqs }, { data: classes }] = await Promise.all([
    ids.length
      ? admin.from('staff_subject_requests').select('profile_id, subjects(name)').in('profile_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    admin.from('classes').select('id, name'),
  ])

  const classNameById = new Map((classes ?? []).map((c: any) => [c.id, c.name]))
  const subjectsByProfile = new Map<string, string[]>()
  for (const r of (subjectReqs ?? []) as any[]) {
    const list = subjectsByProfile.get(r.profile_id) ?? []
    if (r.subjects?.name) list.push(r.subjects.name)
    subjectsByProfile.set(r.profile_id, list)
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Approval queue</h2>
          {rows.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-brand-primary text-white text-xs font-bold">
              {rows.length}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-muted mt-1">
          Review staff who registered themselves. Approving grants immediate access.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing to approve"
          description="New self-registrations will appear here for review."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const subjects = subjectsByProfile.get(r.id) ?? []
            const isAdminReq = r.role === 'ADMIN'
            return (
              <div key={r.id} className="card p-5">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {r.full_name.split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join('') || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink">{r.full_name}</p>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
                        ${isAdminReq ? 'bg-brand-primary-light text-brand-primary-dark' : 'bg-blue-50 text-blue-600'}`}>
                        {isAdminReq ? <ShieldCheck className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
                        {isAdminReq ? 'Administrator' : 'Subject Teacher'}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1 text-sm text-ink-muted">
                      <p className="flex items-center gap-2 break-all"><Mail className="w-3.5 h-3.5 flex-shrink-0" /> {r.email}</p>
                      {r.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 flex-shrink-0" /> {r.phone}</p>}
                      <p className="flex items-center gap-2">
                        <Home className="w-3.5 h-3.5 flex-shrink-0" />
                        {r.wants_class_teacher
                          ? `Homeroom: ${classNameById.get(r.requested_class_id) ?? 'class not found'}`
                          : 'Not a homeroom teacher'}
                      </p>
                    </div>

                    {subjects.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {subjects.map((s) => (
                          <span key={s} className="text-xs bg-surface-muted text-ink-muted px-2 py-0.5 rounded border border-surface-border">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {isAdminReq && (
                      <p className="mt-3 flex items-start gap-1.5 text-xs text-brand-primary-dark bg-brand-primary-light border border-brand-primary/20 rounded-lg px-2.5 py-2">
                        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        This person requested full administrator access. Approve only if that is correct.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <ApprovalActions profileId={r.id} name={r.full_name} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

