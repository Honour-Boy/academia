import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import UpdatePasswordForm from './UpdatePasswordForm'

export const metadata: Metadata = { title: 'Set New Password' }

export default function UpdatePasswordPage() {
  const schoolName = process.env.NEXT_PUBLIC_SCHOOL_NAME ?? 'My Dream College'

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 py-10 bg-gradient-to-br from-brand-accent via-brand-accent-dark to-brand-primary-dark">
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-brand-secondary/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-primary/30 blur-3xl" />

      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary shadow-lg shadow-brand-primary/30 mb-4 ring-1 ring-white/20">
            <ShieldCheck className="w-8 h-8 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{schoolName}</h1>
          <p className="text-white/60 text-sm mt-1">Staff Grading Portal</p>
        </div>

        <div className="relative card overflow-hidden p-6 sm:p-8 shadow-2xl shadow-black/30">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary" />

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-ink">Set a new password</h2>
            <p className="text-ink-muted text-sm mt-1">
              Choose a strong password you don&apos;t use anywhere else.
            </p>
          </div>

          <UpdatePasswordForm />
        </div>
      </div>
    </main>
  )
}
