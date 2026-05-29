import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { User, Mail, KeyRound, ShieldCheck, Monitor, ChevronLeft, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { IdentityForm, PasswordForm } from './ProfileForms'
import SessionsCard, { type SessionRow } from './SessionsCard'
import SubjectChangeRequestForm from './SubjectChangeRequestForm'

// Pull the session_id claim out of a Supabase JWT without bringing in a JWT
// library. The payload is the middle segment; URL-safe base64.
function decodeSessionId(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null
  const parts = accessToken.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4)
    const json = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'))
    return typeof json.session_id === 'string' ? json.session_id : null
  } catch {
    return null
  }
}

export const metadata: Metadata = { title: 'My profile' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS lets you read your own row; no admin client needed here.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, phone, role, created_at')
    .eq('id', user.id)
    .single()

  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  // Active sessions — `auth.sessions` is under the `auth` schema, which
  // PostgREST does NOT expose. The user-scoped client and the service-role
  // admin client both silently return [] when you `.schema('auth').from(...)`.
  // Use the SECURITY DEFINER RPC `get_my_sessions` (migration 009) instead,
  // which scopes to auth.uid() internally so it can only return the caller's
  // own rows.
  const { data: sessionData } = await supabase.auth.getSession()
  const currentSessionId = decodeSessionId(sessionData?.session?.access_token)
  const { data: rawSessions } = await supabase.rpc('get_my_sessions')

  const sessions: SessionRow[] = (rawSessions ?? []).map((s: {
    id: string; created_at: string; refreshed_at: string | null;
    user_agent: string | null; ip: string | null
  }) => ({
    id: s.id,
    createdAt: s.created_at,
    refreshedAt: s.refreshed_at,
    userAgent: s.user_agent,
    ip: s.ip ? String(s.ip) : null,
    isCurrent: currentSessionId === s.id,
  }))

  const initials = profile.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join('') || '?'

  const isAdmin = profile.role === 'ADMIN'

  // For the subject change request section (TEACHER only): fetch the catalogue,
  // the teacher's current registered subjects, and any existing pending request.
  let availableSubjects: { id: string; name: string }[] = []
  let currentSubjectIds: string[] = []
  let pendingRequest: {
    id: string; created_at: string; subjectIds: string[]
  } | null = null

  if (!isAdmin) {
    const [{ data: allSubjects }, { data: currentReqs }] = await Promise.all([
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('staff_subject_requests').select('subject_id').eq('profile_id', user.id),
    ])
    availableSubjects = (allSubjects ?? []).map((s) => ({ id: s.id, name: s.name }))
    currentSubjectIds = (currentReqs ?? []).map((r) => r.subject_id as string)

    const { data: pendingRow } = await supabase
      .from('staff_subject_change_requests')
      .select('id, created_at')
      .eq('profile_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (pendingRow) {
      const { data: pendingSubjects } = await supabase
        .from('staff_subject_change_request_subjects')
        .select('subject_id')
        .eq('request_id', pendingRow.id)
      pendingRequest = {
        id: pendingRow.id,
        created_at: pendingRow.created_at,
        subjectIds: (pendingSubjects ?? []).map((r) => r.subject_id as string),
      }
    }
  }

  // Back link target — admins came from AdminShell; teachers from dashboard.
  const backHref = isAdmin ? '/admin' : '/dashboard'
  const backLabel = isAdmin ? 'Back to admin console' : 'Back to dashboard'

  // Admins now render inside AdminShell (its main supplies max-w-5xl + the
  // page padding), so we drop the px/py here for that path. Teacher chrome
  // (NavBar) doesn't supply horizontal padding, so the teacher path keeps it.
  const containerCls = isAdmin
    ? 'max-w-2xl mx-auto space-y-6 animate-fade-in-up'
    : 'max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-fade-in-up'

  return (
    <div className={containerCls}>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-primary transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> {backLabel}
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-white font-bold text-lg ring-1 ring-white/40 shadow-md shadow-brand-primary/20">
          {initials}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight truncate">{profile.full_name}</h1>
          <p className="text-sm text-ink-muted flex items-center gap-1.5 mt-0.5">
            <Mail className="w-3.5 h-3.5" /> {profile.email}
          </p>
        </div>
        {isAdmin && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-brand-primary-light text-brand-primary-dark px-2 py-1 rounded">
            <ShieldCheck className="w-3 h-3" /> Admin
          </span>
        )}
      </div>

      {/* Identity */}
      <section className="card p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-accent/10 text-brand-accent">
            <User className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Identity</h2>
            <p className="text-xs text-ink-muted">Your display name and contact number.</p>
          </div>
        </div>
        <IdentityForm
          defaultName={profile.full_name}
          defaultPhone={profile.phone ?? ''}
        />
      </section>

      {/* Password */}
      <section className="card p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-primary-light text-brand-primary-dark">
            <KeyRound className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Password</h2>
            <p className="text-xs text-ink-muted">Requires your current password to confirm the change.</p>
          </div>
        </div>
        <PasswordForm />
      </section>

      {/* Subjects taught — teachers only. Lets the teacher request a change
          to their registered subject list; admin approves on /admin/approvals. */}
      {!isAdmin && (
        <section className="card p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-secondary-light text-brand-secondary-dark">
              <BookOpen className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">Subjects I teach</h2>
              <p className="text-xs text-ink-muted">Propose changes to your subject list — an admin approves before they take effect.</p>
            </div>
          </div>
          <SubjectChangeRequestForm
            availableSubjects={availableSubjects}
            currentSubjectIds={currentSubjectIds}
            pendingRequest={pendingRequest}
          />
        </section>
      )}

      {/* Sessions */}
      <section className="card p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-accent/10 text-brand-accent">
            <Monitor className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Active sessions</h2>
            <p className="text-xs text-ink-muted">Devices currently signed in to your account.</p>
          </div>
        </div>
        <SessionsCard sessions={sessions} />
      </section>

      {/* Read-only account info */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-ink mb-3">Account</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">Email</dt>
            <dd className="text-ink mt-0.5">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">Role</dt>
            <dd className="text-ink mt-0.5 capitalize">{profile.role.toLowerCase()}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">Member since</dt>
            <dd className="text-ink mt-0.5">{new Date(profile.created_at).toLocaleDateString()}</dd>
          </div>
        </dl>
        <p className="text-xs text-ink-subtle mt-4">
          To change your email or role, contact an administrator.
        </p>
      </section>
    </div>
  )
}
