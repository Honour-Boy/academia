'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { LogOut, ShieldCheck, GraduationCap, UserCog } from 'lucide-react'

interface NavBarProps {
  profile: Pick<Profile, 'full_name' | 'role'>
  schoolName: string
}

export default function NavBar({ profile, schoolName }: NavBarProps) {
  const pathname = usePathname()
  const router = useRouter()

  if (pathname.startsWith('/admin')) return null

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isAdmin = profile.role === 'ADMIN'
  const initials = profile.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?'

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-white/85 backdrop-blur-md border-b border-surface-border">
      <span aria-hidden="true" className="block h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary" />
      <div className="h-16 px-3 sm:px-6 flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2.5 mr-auto cursor-pointer group min-w-0">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary shadow-md shadow-brand-primary/25 ring-1 ring-white/40">
            <GraduationCap className="w-4 h-4 text-white" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink truncate leading-tight">{schoolName}</p>
            <p className="text-[10px] uppercase tracking-wider text-ink-subtle leading-tight mt-0.5 hidden sm:block">Staff console</p>
          </div>
        </Link>

        {isAdmin && (
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs sm:text-sm font-semibold text-brand-primary-dark bg-brand-primary-light hover:bg-brand-primary hover:text-white cursor-pointer transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Admin console</span>
          </Link>
        )}

        <div className="flex items-center gap-2 pl-2 sm:pl-3 sm:border-l border-surface-border">
          <Link
            href="/profile"
            aria-label="My profile"
            className="flex items-center gap-2 rounded-lg pl-1 pr-1.5 sm:pr-2 py-1 hover:bg-surface-muted cursor-pointer transition-colors group"
          >
            <div className="text-right hidden sm:block">
              <p className="text-ink text-sm font-medium leading-none group-hover:text-brand-primary transition-colors">{profile.full_name}</p>
              <p className="text-ink-subtle text-xs mt-0.5 capitalize">{profile.role.toLowerCase()}</p>
            </div>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-white font-semibold text-xs ring-1 ring-white/40 shadow-sm"
            >
              {initials}
            </span>
          </Link>
          <Link
            href="/profile"
            aria-label="Edit profile"
            className="sm:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors"
          >
            <UserCog className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
