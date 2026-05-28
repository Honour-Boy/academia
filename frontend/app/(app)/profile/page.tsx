import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { User, Mail, KeyRound, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { IdentityForm, PasswordForm } from './ProfileForms'

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

  const initials = profile.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join('') || '?'

  const isAdmin = profile.role === 'ADMIN'

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-fade-in-up">
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
