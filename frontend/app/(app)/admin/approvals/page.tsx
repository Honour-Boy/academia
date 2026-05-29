import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Mail, Phone, BookOpen, Home, ShieldCheck, Inbox, RefreshCw, Plus, Minus } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import ApprovalActions from './ApprovalActions'
import SubjectChangeApprovalActions from './SubjectChangeApprovalActions'

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

  // Subject change requests from existing teachers — separate queue below.
  const { data: changeRequests } = await admin
    .from('staff_subject_change_requests')
    .select('id, profile_id, created_at, profiles!profile_id(full_name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const changeIds = (changeRequests ?? []).map((r: any) => r.id)
  const profileIds = (changeRequests ?? []).map((r: any) => r.profile_id)
  const [{ data: proposedSubjects }, { data: currentSubjectsRows }] = await Promise.all([
    changeIds.length
      ? admin
          .from('staff_subject_change_request_subjects')
          .select('request_id, subjects(id, name)')
          .in('request_id', changeIds)
      : Promise.resolve({ data: [] as any[] }),
    profileIds.length
      ? admin
          .from('staff_subject_requests')
          .select('profile_id, subjects(id, name)')
          .in('profile_id', profileIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  // Group proposed subjects per request and current subjects per teacher.
  const proposedByRequest = new Map<string, { id: string; name: string }[]>()
  for (const r of (proposedSubjects ?? []) as any[]) {
    const list = proposedByRequest.get(r.request_id) ?? []
    if (r.subjects?.id) list.push({ id: r.subjects.id, name: r.subjects.name })
    proposedByRequest.set(r.request_id, list)
  }
  const currentByProfile = new Map<string, { id: string; name: string }[]>()
  for (const r of (currentSubjectsRows ?? []) as any[]) {
    const list = currentByProfile.get(r.profile_id) ?? []
    if (r.subjects?.id) list.push({ id: r.subjects.id, name: r.subjects.name })
    currentByProfile.set(r.profile_id, list)
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

      {rows.length === 0 && (changeRequests ?? []).length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing to approve"
          description="New self-registrations and teacher subject-change requests will appear here for review."
        />
      ) : (
        <>
        {rows.length > 0 && (
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            New staff registrations · {rows.length}
          </h3>
        )}
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

        {(changeRequests ?? []).length > 0 && (
          <section className="space-y-4 mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              Subject-change requests · {(changeRequests ?? []).length}
            </h3>
            {(changeRequests ?? []).map((cr: any) => {
              const profile = cr.profiles as { full_name: string; email: string } | null
              const proposedList = proposedByRequest.get(cr.id) ?? []
              const currentList = currentByProfile.get(cr.profile_id) ?? []
              const currentSet = new Set(currentList.map((s) => s.id))
              const proposedSet = new Set(proposedList.map((s) => s.id))
              const additions = proposedList.filter((s) => !currentSet.has(s.id))
              const removals = currentList.filter((s) => !proposedSet.has(s.id))
              const unchanged = proposedList.filter((s) => currentSet.has(s.id))
              return (
                <div key={cr.id} className="card p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-brand-secondary-light text-brand-secondary-dark flex items-center justify-center flex-shrink-0">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink">{profile?.full_name ?? 'Unknown teacher'}</p>
                      <p className="text-xs text-ink-muted flex items-center gap-1.5 mt-0.5">
                        <Mail className="w-3 h-3" /> {profile?.email ?? '—'}
                        <span>·</span>
                        <span>Submitted {new Date(cr.created_at).toLocaleString()}</span>
                      </p>

                      <div className="mt-3 space-y-2">
                        {additions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-brand-primary-dark">
                              <Plus className="w-3 h-3" /> Adding
                            </span>
                            {additions.map((s) => (
                              <span key={s.id} className="text-xs bg-brand-primary-light text-brand-primary-dark px-2 py-0.5 rounded border border-brand-primary/30">
                                {s.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {removals.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-red-700">
                              <Minus className="w-3 h-3" /> Removing
                            </span>
                            {removals.map((s) => (
                              <span key={s.id} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-200 line-through">
                                {s.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {unchanged.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                              Keeping
                            </span>
                            {unchanged.map((s) => (
                              <span key={s.id} className="text-xs bg-surface-muted text-ink-muted px-2 py-0.5 rounded border border-surface-border">
                                {s.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {additions.length === 0 && removals.length === 0 && (
                          <p className="text-xs italic text-ink-subtle">No diff — request matches current list.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <SubjectChangeApprovalActions
                      requestId={cr.id}
                      teacherName={profile?.full_name ?? 'this teacher'}
                    />
                  </div>
                </div>
              )
            })}
          </section>
        )}
        </>
      )}
    </div>
  )
}

