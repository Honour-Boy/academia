'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import NavProgress from '@/components/ui/NavProgress'
import {
  LayoutDashboard,
  UserCheck,
  Users,
  GraduationCap,
  BookOpen,
  Network,
  FileText,
  History,
  Menu,
  LogOut,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetClose } from '@/components/ui/Sheet'

interface AdminShellProps {
  children: React.ReactNode
  profile: { full_name: string; email: string; role: string }
  pendingCount: number
  schoolName: string
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

export default function AdminShell({ children, profile, pendingCount, schoolName }: AdminShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const nav: NavItem[] = [
    { href: '/admin',             label: 'Overview',    icon: LayoutDashboard },
    { href: '/admin/approvals',   label: 'Approvals',   icon: UserCheck, badge: pendingCount },
    { href: '/admin/teachers',    label: 'Teachers',    icon: Users },
    { href: '/admin/classes',     label: 'Classes',     icon: GraduationCap },
    { href: '/admin/students',    label: 'Students',    icon: BookOpen },
    { href: '/admin/assignments', label: 'Assignments', icon: Network },
    { href: '/admin/reports',     label: 'Reports',     icon: FileText },
    { href: '/admin/audit',       label: 'Audit log',   icon: History },
  ]

  // Active match: exact for /admin (don't light it up on every sub-route);
  // prefix match for everything else.
  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const currentPage = nav.find((n) => isActive(n.href))?.label ?? 'Admin'
  const initials = profile.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  return (
    <div className="min-h-screen flex bg-surface-muted">
      <Suspense fallback={null}><NavProgress /></Suspense>

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-72 fixed inset-y-0 left-0 z-30 flex-col bg-gradient-to-b from-brand-accent via-brand-accent-dark to-brand-primary-dark text-white">
        {/* Top accent strip */}
        <span aria-hidden="true" className="h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary" />
        <SidebarBody nav={nav} isActive={isActive} schoolName={schoolName} />
      </aside>

      {/* ── Mobile drawer (Sheet) ───────────────────────────────────── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="bg-gradient-to-b from-brand-accent via-brand-accent-dark to-brand-primary-dark text-white">
          <SheetTitle>Admin navigation</SheetTitle>
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary" />
          <SidebarBody nav={nav} isActive={isActive} schoolName={schoolName} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* ── Main column ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-72">
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-16 px-3 sm:px-6 flex items-center gap-3 bg-white/85 backdrop-blur-md border-b border-surface-border">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted cursor-pointer transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle hidden sm:block">Admin</p>
            <h1 className="text-base sm:text-lg font-semibold text-ink truncate">{currentPage}</h1>
          </div>

          {/* User pill — tap signs out (simple for v1; can swap to DropdownMenu later) */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-ink text-sm font-medium leading-none">{profile.full_name}</p>
              <p className="text-ink-subtle text-xs mt-0.5">Administrator</p>
            </div>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-white font-semibold text-xs ring-1 ring-white/40 shadow-sm"
            >
              {initials || 'A'}
            </span>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-x-hidden">
          <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 animate-fade-in-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

/* ── Shared sidebar body — used by both desktop sidebar and mobile drawer ── */

interface SidebarBodyProps {
  nav: NavItem[]
  isActive: (href: string) => boolean
  schoolName: string
  onNavigate?: () => void
}

function SidebarBody({ nav, isActive, schoolName, onNavigate }: SidebarBodyProps) {
  const Wrap = onNavigate ? SheetClose : 'div'
  return (
    <div className="flex flex-col h-full px-4 pt-5 pb-6">
      {/* Brand */}
      <Link
        href="/admin"
        onClick={onNavigate}
        className="flex items-center gap-3 mb-8 px-2 cursor-pointer group"
      >
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary shadow-lg shadow-brand-primary/30 ring-1 ring-white/20">
          <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">{schoolName}</p>
          <p className="text-white/60 text-xs mt-0.5">Admin Console</p>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(href)
          const linkEl = (
            <Link
              href={href}
              onClick={onNavigate}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors min-h-touch',
                active
                  ? 'bg-white/15 text-white shadow-inner shadow-white/5'
                  : 'text-white/65 hover:text-white hover:bg-white/10',
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-brand-secondary' : 'text-white/50 group-hover:text-white/80')} />
              <span className="flex-1">{label}</span>
              {badge && badge > 0 ? (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand-secondary text-brand-accent-dark text-[10px] font-bold leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
              {active && <ChevronRight className="w-3.5 h-3.5 text-white/60" />}
            </Link>
          )
          // Wrap in SheetClose on mobile so tapping a link closes the drawer.
          return Wrap === SheetClose
            ? <Wrap key={href} asChild>{linkEl}</Wrap>
            : <div key={href}>{linkEl}</div>
        })}
      </nav>

      {/* Footer */}
      <div className="pt-5 mt-5 border-t border-white/10">
        <p className="text-white/40 text-[11px] leading-relaxed text-center">
          Authorised access only.<br />
          Activity is logged.
        </p>
      </div>
    </div>
  )
}
