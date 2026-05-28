import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Users,
  GraduationCap,
  BookOpen,
  BarChart3,
  UserCheck,
  UserPlus,
  Network,
  FileText,
  History,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import StatCard from '@/components/ui/StatCard'

export const metadata: Metadata = { title: 'Admin · Overview' }

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  // Stats fetched in parallel
  const [
    { count: teacherCount },
    { count: classCount },
    { count: studentCount },
    { count: gradeCount },
    { count: pendingCount },
    { data: recentApprovals },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'TEACHER').eq('is_active', true),
    supabase.from('classes').select('id', { count: 'exact', head: true }),
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('grades').select('id', { count: 'exact', head: true }).not('score', 'is', null),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('onboarding_complete', true),
    supabase
      .from('profiles')
      .select('id, full_name, role, status, created_at')
      .in('status', ['approved', 'pending'])
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const stats = [
    { label: 'Active teachers',  value: teacherCount ?? 0, icon: Users,         tone: 'crimson' as const, href: '/admin/teachers',   hint: 'Approved staff' },
    { label: 'Classes',          value: classCount ?? 0,   icon: GraduationCap, tone: 'navy' as const,    href: '/admin/classes',    hint: 'JSS + SS arms' },
    { label: 'Active students',  value: studentCount ?? 0, icon: BookOpen,      tone: 'gold' as const,    href: '/admin/students',   hint: 'Enrolled' },
    { label: 'Grades entered',   value: gradeCount ?? 0,   icon: BarChart3,     tone: 'emerald' as const, href: '/admin/reports',    hint: 'Across all terms' },
  ]

  const quickActions = [
    { label: 'Approve sign-ups',  description: 'Review self-registered staff',         href: '/admin/approvals',     icon: UserCheck, accent: pendingCount && pendingCount > 0 },
    { label: 'Add a teacher',     description: 'Create a staff account directly',      href: '/admin/teachers/new',  icon: UserPlus },
    { label: 'Manage classes',    description: 'Create classes & assign class teachers', href: '/admin/classes',  icon: GraduationCap },
    { label: 'Assign subjects',   description: 'Link subject teachers to classes',     href: '/admin/assignments',   icon: Network },
    { label: 'Enroll students',   description: 'Register students + select subjects',   href: '/admin/students/new',  icon: UserPlus },
    { label: 'Report sheets',     description: 'Browse, preview & download PDFs',     href: '/admin/reports',       icon: FileText },
    { label: 'Audit log',         description: 'Who changed which grade, and when',    href: '/admin/audit',         icon: History },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-accent via-brand-accent-dark to-brand-primary-dark text-white p-6 sm:p-8 shadow-lg shadow-brand-accent/20">
        <span aria-hidden="true" className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-brand-secondary/20 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-12 w-56 h-56 rounded-full bg-brand-primary/30 blur-3xl" />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-secondary mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Overview
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome back, {firstName}.</h2>
          <p className="text-white/70 text-sm sm:text-base mt-2 max-w-lg">
            Here&apos;s the current state of the school at a glance. Pending tasks need your attention first.
          </p>
        </div>
      </section>

      {/* Pending-approvals priority banner */}
      {(pendingCount ?? 0) > 0 && (
        <Link
          href="/admin/approvals"
          className="group flex items-center gap-4 p-4 sm:p-5 rounded-2xl bg-brand-primary-light border border-brand-primary/30 hover:border-brand-primary/60 hover:shadow-lg transition-all active:scale-[0.99]"
        >
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-primary text-white shadow-sm flex-shrink-0">
            <UserCheck className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm sm:text-base font-semibold text-brand-primary-dark">
              {pendingCount} staff {pendingCount === 1 ? 'registration is' : 'registrations are'} awaiting your approval
            </p>
            <p className="text-xs sm:text-sm text-brand-primary-dark/70 mt-0.5">Tap to review and approve or deny.</p>
          </div>
          <ChevronRight className="w-5 h-5 text-brand-primary flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      {/* Stats */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">At a glance</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </section>

      {/* Two-column on desktop: quick actions + recent activity */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <section className="lg:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">Quick actions</h3>
          <div className="card divide-y divide-surface-border overflow-hidden">
            {quickActions.map(({ label, description, href, icon: Icon, accent }) => (
              <Link
                key={label}
                href={href}
                className="group flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-surface-muted cursor-pointer transition-colors min-h-touch"
              >
                <span
                  className={
                    'inline-flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ' +
                    (accent
                      ? 'bg-brand-primary text-white'
                      : 'bg-surface-muted text-ink-muted group-hover:bg-brand-primary-light group-hover:text-brand-primary-dark')
                  }
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{label}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-subtle flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>

        {/* Recent activity */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">Recent staff activity</h3>
          <div className="card p-4 sm:p-5">
            {(recentApprovals ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-6">No staff activity yet.</p>
            ) : (
              <ol className="space-y-3">
                {(recentApprovals ?? []).map((p: any) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span
                      className={
                        'inline-flex items-center justify-center w-8 h-8 rounded-full text-[10px] font-bold flex-shrink-0 ring-1 ring-white/40 ' +
                        (p.status === 'approved'
                          ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white'
                          : 'bg-gradient-to-br from-brand-secondary to-brand-primary text-white')
                      }
                    >
                      {(p.full_name || '?').split(/\s+/).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join('') || '?'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink font-medium truncate">{p.full_name}</p>
                      <p className="text-xs text-ink-muted">
                        {p.status === 'approved' ? 'Approved' : 'Awaiting approval'} · {p.role}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
