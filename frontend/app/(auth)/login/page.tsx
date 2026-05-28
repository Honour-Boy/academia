import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, AlertTriangle, UserPlus, ArrowRight, Clock, LogOut } from 'lucide-react'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'Sign In' }

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized:
    'That account isn’t authorised. Only registered staff — teachers and administrators — can sign in.',
  oauth: 'Google sign-in didn’t complete. Please try again.',
  link: 'That sign-in link is missing required information. Please request a new one.',
  session:
    'We couldn’t complete sign-in. The link may have expired or already been used, or you opened it in a different browser. Please request a new link in the same browser you started from.',
}

const REASON_NOTICES: Record<string, { title: string; body: string; icon: 'clock' | 'logout' }> = {
  inactive: {
    title: 'Signed out for inactivity',
    body: 'You were signed out after a period of no activity. Sign in again to continue where you left off.',
    icon: 'clock',
  },
  'session-ended': {
    title: 'Your session ended',
    body: 'You were signed out — possibly from another device, by an admin, or because your password changed. Sign in again to continue.',
    icon: 'logout',
  },
  'signed-out-everywhere': {
    title: 'Signed out everywhere',
    body: 'All your sessions have been ended. Sign in again to start a new one.',
    icon: 'logout',
  },
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; reason?: string }
}) {
  const schoolName = process.env.NEXT_PUBLIC_SCHOOL_NAME ?? 'My Dream College'
  const alert = searchParams?.error ? ERROR_MESSAGES[searchParams.error] : null
  const notice = searchParams?.reason ? REASON_NOTICES[searchParams.reason] : null

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 py-10 bg-gradient-to-br from-brand-accent via-brand-accent-dark to-brand-primary-dark">
      {/* Decorative gold glow + crimson wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-brand-secondary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-primary/30 blur-3xl"
      />

      <div className="relative w-full max-w-sm animate-fade-in-up">
        {/* Brand mark + school name */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary shadow-lg shadow-brand-primary/30 mb-4 ring-1 ring-white/20">
            <ShieldCheck className="w-8 h-8 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{schoolName}</h1>
          <p className="text-white/60 text-sm mt-1">Staff Grading Portal</p>
        </div>

        {/* Login card */}
        <div className="relative card overflow-hidden p-6 sm:p-8 shadow-2xl shadow-black/30">
          {/* Gold accent strip */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary" />

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-ink">Welcome back</h2>
            <p className="text-ink-muted text-sm mt-1">Sign in to continue — authorised staff only.</p>
          </div>

          {/* Unauthorised / OAuth error (server-rendered from ?error=) */}
          {alert && (
            <div
              role="alert"
              className="flex items-start gap-2 mb-5 p-3 rounded-lg bg-brand-primary-light border border-brand-primary/25 text-brand-primary-dark text-sm"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{alert}</span>
            </div>
          )}

          {/* Sign-out reason notice (?reason=inactive | session-ended | signed-out-everywhere) */}
          {notice && (
            <div
              role="status"
              className="flex items-start gap-2 mb-5 p-3 rounded-lg bg-brand-secondary-light border border-brand-secondary/30 text-ink text-sm"
            >
              {notice.icon === 'clock'
                ? <Clock className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-secondary-dark" />
                : <LogOut className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-secondary-dark" />}
              <div className="min-w-0">
                <p className="font-medium">{notice.title}</p>
                <p className="text-ink-muted mt-0.5">{notice.body}</p>
              </div>
            </div>
          )}

          <LoginForm />

          {/* New staff sign-up entry point */}
          <div className="mt-6 pt-5 border-t border-surface-border">
            <Link
              href="/register"
              className="group flex items-center justify-center gap-2 text-sm font-medium text-brand-primary hover:text-brand-primary-dark transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              New staff? Register &amp; set up your profile
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Security note */}
        <p className="text-white/45 text-xs mt-6 text-center max-w-xs mx-auto leading-relaxed">
          This system is for teachers and administrators only.
          Unauthorised access attempts are logged.
        </p>
      </div>
    </main>
  )
}
