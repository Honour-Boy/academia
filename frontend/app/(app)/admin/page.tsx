import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, BookOpen, GraduationCap, BarChart3, ChevronRight, UserCheck } from 'lucide-react'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  // Fetch stats in parallel
  const [
    { count: teacherCount },
    { count: classCount },
    { count: studentCount },
    { count: gradeCount },
    { count: pendingCount },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'TEACHER').eq('is_active', true),
    supabase.from('classes').select('id', { count: 'exact', head: true }),
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('grades').select('id', { count: 'exact', head: true }).not('score', 'is', null),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('onboarding_complete', true),
  ])

  const stats = [
    { label: 'Teachers',       value: teacherCount ?? 0, icon: Users,          href: '/admin/teachers', color: 'bg-blue-50 text-blue-600' },
    { label: 'Classes',        value: classCount ?? 0,   icon: GraduationCap,  href: '/admin/classes',  color: 'bg-purple-50 text-purple-600' },
    { label: 'Students',       value: studentCount ?? 0, icon: BookOpen,       href: '/admin/students', color: 'bg-amber-50 text-amber-600' },
    { label: 'Grades entered', value: gradeCount ?? 0,   icon: BarChart3,      href: '/admin/reports',  color: 'bg-emerald-50 text-emerald-600' },
  ]

  const quickLinks = [
    { label: 'Approval queue',         description: 'Review self-registered staff',         href: '/admin/approvals' },
    { label: 'Add a teacher',          description: 'Create a staff account',               href: '/admin/teachers/new' },
    { label: 'Manage classes',         description: 'Assign class teachers to each arm',    href: '/admin/classes' },
    { label: 'Assign subjects',        description: 'Link subject teachers to classes',     href: '/admin/assignments' },
    { label: 'Enroll students',        description: 'Register students + select subjects',  href: '/admin/students/new' },
    { label: 'Manage students',        description: 'Edit enrolment or deactivate',         href: '/admin/students' },
    { label: 'View all reports',       description: 'Browse & download report sheets',      href: '/admin/reports' },
    { label: 'Grade audit log',        description: 'See who changed what',                 href: '/admin/audit' },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold text-ink mb-1">Admin Panel</h1>
      <p className="text-ink-muted text-sm mb-6">Manage teachers, classes, and report data.</p>

      {/* Pending approvals banner */}
      {(pendingCount ?? 0) > 0 && (
        <Link
          href="/admin/approvals"
          className="flex items-center gap-3 mb-6 p-4 rounded-xl bg-brand-primary-light border border-brand-primary/25 hover:border-brand-primary/50 transition-all active:scale-[0.99]"
        >
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-brand-primary text-white flex-shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-brand-primary-dark">
              {pendingCount} staff {pendingCount === 1 ? 'registration' : 'registrations'} awaiting approval
            </p>
            <p className="text-xs text-brand-primary-dark/70 mt-0.5">Review and approve or deny new sign-ups.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-brand-primary flex-shrink-0" />
        </Link>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {stats.map(({ label, value, icon: Icon, href, color }) => (
          <Link key={label} href={href} className="card p-4 cursor-pointer hover:shadow-md transition-all duration-150 active:scale-[0.98]">
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg mb-3 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold font-mono text-ink">{value.toLocaleString()}</p>
            <p className="text-ink-muted text-xs mt-0.5">{label}</p>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <h2 className="font-semibold text-ink text-sm mb-3 uppercase tracking-wider">Quick actions</h2>
      <div className="card divide-y divide-surface-border">
        {quickLinks.map(({ label, description, href }) => (
          <Link key={label} href={href}
            className="flex items-center gap-3 px-4 py-4 hover:bg-surface-muted cursor-pointer transition-colors">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">{label}</p>
              <p className="text-xs text-ink-muted mt-0.5">{description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-subtle flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
