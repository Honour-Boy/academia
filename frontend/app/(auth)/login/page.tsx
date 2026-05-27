import type { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'Sign In' }

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-sidebar flex flex-col items-center justify-center px-4 py-12">
      {/* Logo / School name */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand mb-4">
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-white" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Academia</h1>
        <p className="text-slate-400 text-sm mt-1">
          {process.env.NEXT_PUBLIC_SCHOOL_NAME ?? 'Staff Portal'}
        </p>
      </div>

      {/* Login card */}
      <div className="w-full max-w-sm card p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-ink mb-1">Sign in</h2>
        <p className="text-ink-muted text-sm mb-6">Authorised staff only</p>
        <LoginForm />
      </div>

      {/* Security note */}
      <p className="text-slate-500 text-xs mt-6 text-center max-w-xs">
        This system is for teachers and administrators only.
        Unauthorised access attempts are logged.
      </p>
    </main>
  )
}
