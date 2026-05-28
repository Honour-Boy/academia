import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck, ArrowLeft } from 'lucide-react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import RegisterWizard from './RegisterWizard'

export const metadata: Metadata = { title: 'Register' }

export default async function RegisterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let authenticated = false
  let prefillName: string | undefined
  let prefillEmail: string | undefined

  if (user) {
    // Already signed in (e.g. via Google). If onboarding is done, route onward.
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_complete, full_name')
      .eq('id', user.id)
      .single()

    if (profile?.onboarding_complete) {
      redirect('/dashboard')
    }

    authenticated = true
    prefillEmail = user.email ?? undefined
    prefillName =
      (user.user_metadata?.full_name as string | undefined) || profile?.full_name || undefined
  }

  // Subjects + classes for the form. A pending / unauthenticated user can't read
  // these under RLS, so use the service-role client (read-only, non-sensitive).
  const admin = createAdminClient()
  const [{ data: subjects }, { data: classes }] = await Promise.all([
    admin.from('subjects').select('id, name').order('name'),
    admin.from('classes').select('id, name').order('name'),
  ])

  const schoolName = process.env.NEXT_PUBLIC_SCHOOL_NAME ?? 'My Dream College'

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 py-10 bg-gradient-to-br from-brand-accent via-brand-accent-dark to-brand-primary-dark">
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-brand-secondary/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-primary/30 blur-3xl" />

      <div className="relative w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary shadow-lg shadow-brand-primary/30 mb-3 ring-1 ring-white/20">
            <ShieldCheck className="w-7 h-7 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">{schoolName}</h1>
          <p className="text-white/60 text-sm mt-1">New staff registration</p>
        </div>

        <div className="relative card overflow-hidden p-6 sm:p-8 shadow-2xl shadow-black/30">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary" />

          <div className="mb-6">
            <h2 className="text-lg font-semibold text-ink">Set up your profile</h2>
            <p className="text-ink-muted text-sm mt-1">
              Tell us your role and what you teach. An administrator approves every account.
            </p>
          </div>

          <RegisterWizard
            authenticated={authenticated}
            prefillName={prefillName}
            prefillEmail={prefillEmail}
            subjects={subjects ?? []}
            classes={classes ?? []}
          />
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
