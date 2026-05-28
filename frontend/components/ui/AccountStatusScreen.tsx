'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Clock, ShieldX, LogOut, MailCheck } from 'lucide-react'

interface Props {
  variant: 'pending' | 'denied'
  name?: string | null
}

const COPY = {
  pending: {
    Icon: Clock,
    iconWrap: 'from-brand-secondary to-brand-primary',
    title: 'Account Awaiting Admin Verification',
    body: 'Your profile has been submitted. You’ll receive access once a school administrator reviews and approves it. You can safely close this page — there’s nothing else to do right now.',
    note: 'Most requests are reviewed within a school day.',
  },
  denied: {
    Icon: ShieldX,
    iconWrap: 'from-brand-primary to-brand-primary-dark',
    title: 'Access Not Approved',
    body: 'A school administrator has reviewed your registration and did not grant access at this time. If you believe this is a mistake, please contact your school’s administrator directly.',
    note: 'You can sign out below.',
  },
} as const

export default function AccountStatusScreen({ variant, name }: Props) {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const { Icon, iconWrap, title, body, note } = COPY[variant]

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 py-10 bg-gradient-to-br from-brand-accent via-brand-accent-dark to-brand-primary-dark">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-brand-secondary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-primary/30 blur-3xl"
      />

      <div className="relative w-full max-w-md animate-fade-in-up">
        <div className="card overflow-hidden p-8 text-center shadow-2xl shadow-black/30">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary" />

          <div
            className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${iconWrap} shadow-lg shadow-brand-primary/30 mb-5 ring-1 ring-white/20`}
          >
            <Icon className="w-8 h-8 text-white" strokeWidth={2} />
          </div>

          {name && (
            <p className="text-sm text-ink-muted mb-1">
              Hi {name.split(' ')[0]},
            </p>
          )}
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <p className="text-ink-muted text-sm mt-3 leading-relaxed">{body}</p>

          {variant === 'pending' && (
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-brand-primary-dark bg-brand-primary-light border border-brand-primary/20 rounded-lg px-3 py-2">
              <MailCheck className="w-4 h-4 flex-shrink-0" />
              <span>{note}</span>
            </div>
          )}
          {variant === 'denied' && (
            <p className="text-xs text-ink-subtle mt-4">{note}</p>
          )}

          <button onClick={signOut} className="btn-secondary w-full mt-6">
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </main>
  )
}
