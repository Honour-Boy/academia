'use client'

import { useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registerStaffAction, completeOnboardingAction } from './actions'
import type { Class, Subject } from '@/types'
import {
  Eye, EyeOff, Loader2, AlertCircle, Check, ChevronLeft, ChevronRight,
  GraduationCap, ShieldCheck, User, BookOpen, ClipboardCheck,
} from 'lucide-react'

interface Props {
  authenticated: boolean
  prefillName?: string
  prefillEmail?: string
  subjects: Pick<Subject, 'id' | 'name'>[]
  classes: Pick<Class, 'id' | 'name'>[]
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  )
}

type StepKey = 'account' | 'personal' | 'role' | 'review'

export default function RegisterWizard({
  authenticated, prefillName, prefillEmail, subjects, classes,
}: Props) {
  const steps: StepKey[] = useMemo(
    () => (authenticated ? ['personal', 'role', 'review'] : ['account', 'personal', 'role', 'review']),
    [authenticated],
  )

  const [stepIdx, setStepIdx] = useState(0)
  const step = steps[stepIdx]

  // Form state
  const [email, setEmail] = useState(prefillEmail ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState(prefillName ?? '')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'TEACHER' | 'ADMIN'>('TEACHER')
  const [wantsClassTeacher, setWantsClassTeacher] = useState<boolean | null>(null)
  const [requestedClassId, setRequestedClassId] = useState('')
  const [subjectIds, setSubjectIds] = useState<string[]>([])

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [googleLoading, setGoogleLoading] = useState(false)

  const initials = fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'

  function toggleSubject(id: string) {
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (oauthError) {
      setError('Could not start Google sign-up. Please try again.')
      setGoogleLoading(false)
    }
  }

  function stepError(): string | null {
    if (step === 'account') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.'
      if (password.length < 8) return 'Password must be at least 8 characters.'
    }
    if (step === 'personal') {
      if (!fullName.trim()) return 'Please enter your full name.'
      if (!phone.trim()) return 'Please enter a contact number.'
    }
    if (step === 'role') {
      if (wantsClassTeacher === null) return 'Let us know if you are a homeroom teacher.'
      if (wantsClassTeacher && !requestedClassId) return 'Select the class you are the homeroom teacher for.'
      if (role === 'TEACHER' && subjectIds.length === 0) return 'Select at least one subject you teach.'
    }
    return null
  }

  function next() {
    const e = stepError()
    if (e) { setError(e); return }
    setError(null)
    setStepIdx((i) => Math.min(i + 1, steps.length - 1))
  }

  function back() {
    setError(null)
    setStepIdx((i) => Math.max(i - 1, 0))
  }

  function submit() {
    const e = stepError()
    if (e) { setError(e); return }
    setError(null)

    const fd = new FormData()
    fd.set('full_name', fullName.trim())
    fd.set('phone', phone.trim())
    fd.set('role', role)
    fd.set('wants_class_teacher', String(!!wantsClassTeacher))
    if (wantsClassTeacher && requestedClassId) fd.set('requested_class_id', requestedClassId)
    subjectIds.forEach((id) => fd.append('subject_ids', id))
    if (!authenticated) {
      fd.set('email', email.trim())
      fd.set('password', password)
    }

    startTransition(async () => {
      const result = authenticated
        ? await completeOnboardingAction(fd)
        : await registerStaffAction(fd)
      // Success redirects server-side; only errors return.
      if (result?.error) setError(result.error)
    })
  }

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? ''

  return (
    <div>
      <Stepper steps={steps} current={stepIdx} />

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-brand-primary-light border border-brand-primary/25 text-brand-primary-dark text-sm animate-shake"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-5">
        {/* ── Account (email/password or Google) ───────────────────────────── */}
        {step === 'account' && (
          <div className="space-y-5">
            <button type="button" onClick={handleGoogle} disabled={googleLoading || isPending} className="btn-oauth">
              {googleLoading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Connecting to Google…</>
                : <><GoogleIcon className="w-5 h-5" /> Sign up with Google</>}
            </button>

            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-surface-border" />
              <span className="text-xs font-medium uppercase tracking-wider text-ink-subtle">or use email</span>
              <span className="h-px flex-1 bg-surface-border" />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">Email address</label>
              <input id="email" type="email" inputMode="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu.ng" className="input-brand" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">Create a password</label>
              <div className="relative">
                <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="input-brand pr-12" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-ink-subtle hover:text-brand-primary transition-colors">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Personal info ────────────────────────────────────────────────── */}
        {step === 'personal' && (
          <div className="space-y-5">
            {/* Avatar placeholder (upload coming soon) */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary text-white flex items-center justify-center text-xl font-bold ring-1 ring-white/20 shadow-sm">
                {initials}
              </div>
              <div className="text-sm">
                <p className="font-medium text-ink">Profile photo</p>
                <p className="text-ink-subtle text-xs">Upload coming soon — your initials are used for now.</p>
              </div>
            </div>

            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-ink mb-1.5">Full name</label>
              <input id="full_name" type="text" autoComplete="name" value={fullName}
                onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Adewale Okonkwo" className="input-brand" />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-ink mb-1.5">Contact number</label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0803 000 0000" className="input-brand" />
            </div>
            {prefillEmail && (
              <p className="text-xs text-ink-subtle">Signed up as <span className="font-medium text-ink">{prefillEmail}</span></p>
            )}
          </div>
        )}

        {/* ── Role & assignments ───────────────────────────────────────────── */}
        {step === 'role' && (
          <div className="space-y-6">
            {/* Role */}
            <div>
              <p className="text-sm font-medium text-ink mb-2">What is your primary role?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <RoleCard
                  active={role === 'TEACHER'} onClick={() => setRole('TEACHER')}
                  icon={<BookOpen className="w-5 h-5" />} title="Subject Teacher" desc="I mark scripts and enter grades for my subjects." />
                <RoleCard
                  active={role === 'ADMIN'} onClick={() => setRole('ADMIN')}
                  icon={<ShieldCheck className="w-5 h-5" />} title="School Administrator" desc="I manage staff, classes, students and reports." />
              </div>
            </div>

            {/* Homeroom toggle */}
            <div>
              <p className="text-sm font-medium text-ink mb-2">Are you a classroom (homeroom) teacher?</p>
              <div className="grid grid-cols-2 gap-3">
                <ToggleCard active={wantsClassTeacher === true} onClick={() => setWantsClassTeacher(true)} label="Yes" />
                <ToggleCard active={wantsClassTeacher === false} onClick={() => { setWantsClassTeacher(false); setRequestedClassId('') }} label="No" />
              </div>

              {wantsClassTeacher && (
                <div className="mt-3 animate-fade-in-up">
                  <label htmlFor="requested_class_id" className="block text-sm font-medium text-ink mb-1.5">Which class?</label>
                  <select id="requested_class_id" value={requestedClassId}
                    onChange={(e) => setRequestedClassId(e.target.value)} className="input-brand">
                    <option value="">— Select your class —</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Subjects */}
            <div>
              <p className="text-sm font-medium text-ink mb-1">
                Subjects you teach
                {role === 'TEACHER' && <span className="text-brand-primary"> *</span>}
              </p>
              <p className="text-xs text-ink-subtle mb-2">Tick every subject you mark scripts for.</p>
              {subjects.length === 0 ? (
                <p className="text-sm text-ink-muted">No subjects available yet.</p>
              ) : (
                <div className="card p-2 grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-60 overflow-y-auto">
                  {subjects.map((s) => {
                    const checked = subjectIds.includes(s.id)
                    return (
                      <button type="button" key={s.id} onClick={() => toggleSubject(s.id)}
                        className={`flex items-center gap-2.5 text-sm text-left rounded-lg px-3 py-2.5 min-h-touch transition-colors
                          ${checked ? 'bg-brand-primary-light text-brand-primary-dark' : 'hover:bg-surface-muted text-ink'}`}>
                        <span className={`flex items-center justify-center w-5 h-5 rounded border transition-colors flex-shrink-0
                          ${checked ? 'bg-brand-primary border-brand-primary text-white' : 'border-surface-border bg-white'}`}>
                          {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                        </span>
                        {s.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Review ───────────────────────────────────────────────────────── */}
        {step === 'review' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Please confirm your details. After you submit, an administrator will review and approve your account.
            </p>
            <dl className="card divide-y divide-surface-border text-sm">
              <ReviewRow label="Name" value={fullName} />
              <ReviewRow label="Contact" value={phone} />
              {(!authenticated || prefillEmail) && <ReviewRow label="Email" value={authenticated ? prefillEmail ?? '' : email} />}
              <ReviewRow label="Role" value={role === 'ADMIN' ? 'School Administrator' : 'Subject Teacher'} />
              <ReviewRow label="Homeroom teacher" value={wantsClassTeacher ? `Yes — ${className(requestedClassId)}` : 'No'} />
              <ReviewRow
                label="Subjects"
                value={subjectIds.length ? subjects.filter((s) => subjectIds.includes(s.id)).map((s) => s.name).join(', ') : '—'} />
            </dl>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-7">
        {stepIdx > 0 && (
          <button type="button" onClick={back} disabled={isPending} className="btn-secondary flex-1">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        )}
        {step !== 'review' ? (
          <button type="button" onClick={next} disabled={isPending || googleLoading} className="btn-brand flex-1">
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={isPending} className="btn-brand flex-1">
            {isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
              : <><ClipboardCheck className="w-4 h-4" /> Submit for approval</>}
          </button>
        )}
      </div>
    </div>
  )
}

function Stepper({ steps, current }: { steps: StepKey[]; current: number }) {
  const labels: Record<StepKey, { label: string; Icon: typeof User }> = {
    account: { label: 'Account', Icon: User },
    personal: { label: 'Profile', Icon: User },
    role: { label: 'Role', Icon: GraduationCap },
    review: { label: 'Review', Icon: ClipboardCheck },
  }
  return (
    <div className="flex items-center">
      {steps.map((key, i) => {
        const done = i < current
        const active = i === current
        const { Icon } = labels[key]
        return (
          <div key={key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-colors
                ${done ? 'bg-brand-primary text-white'
                  : active ? 'bg-brand-primary/15 text-brand-primary ring-2 ring-brand-primary'
                  : 'bg-surface-muted text-ink-subtle'}`}>
                {done ? <Check className="w-4 h-4" strokeWidth={3} /> : <Icon className="w-4 h-4" />}
              </span>
              <span className={`text-[10px] font-medium ${active ? 'text-brand-primary' : 'text-ink-subtle'}`}>
                {labels[key].label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={`h-0.5 flex-1 mx-1 -mt-4 rounded ${done ? 'bg-brand-primary' : 'bg-surface-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function RoleCard({ active, onClick, icon, title, desc }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left rounded-xl border p-4 transition-all active:scale-[0.98]
        ${active ? 'border-brand-primary bg-brand-primary-light ring-1 ring-brand-primary' : 'border-surface-border bg-white hover:border-ink-subtle'}`}>
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg mb-2
        ${active ? 'bg-brand-primary text-white' : 'bg-surface-muted text-ink-muted'}`}>
        {icon}
      </span>
      <p className="font-semibold text-ink text-sm">{title}</p>
      <p className="text-xs text-ink-muted mt-0.5 leading-snug">{desc}</p>
    </button>
  )
}

function ToggleCard({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl border px-4 py-3 font-medium text-sm transition-all active:scale-[0.98] min-h-touch
        ${active ? 'border-brand-primary bg-brand-primary-light text-brand-primary-dark ring-1 ring-brand-primary' : 'border-surface-border bg-white text-ink hover:border-ink-subtle'}`}>
      {label}
    </button>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="text-ink font-medium text-right">{value || '—'}</dd>
    </div>
  )
}
