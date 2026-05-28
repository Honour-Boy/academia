'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { LogOut, ShieldCheck, GraduationCap } from 'lucide-react'

interface NavBarProps { profile: Pick<Profile, 'full_name' | 'role'> }

export default function NavBar({ profile }: NavBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  // /admin/* renders its own AdminShell (sidebar + topbar) — skip the public
  // top NavBar there to avoid stacking two chromes.
  if (pathname.startsWith('/admin')) return null

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isAdmin = profile.role === 'ADMIN'

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 bg-sidebar border-b border-white/10 flex items-center px-4 gap-3">
      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-2 mr-auto cursor-pointer">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand">
          <GraduationCap className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-semibold text-sm hidden sm:block">Academia</span>
      </Link>

      {/* Admin link */}
      {isAdmin && (
        <Link
          href="/admin"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors
            ${pathname.startsWith('/admin')
              ? 'bg-white/15 text-white'
              : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span className="hidden sm:inline">Admin</span>
        </Link>
      )}

      {/* User pill */}
      <div className="flex items-center gap-2 pl-3 border-l border-white/10">
        <div className="text-right hidden sm:block">
          <p className="text-white text-xs font-medium leading-none">{profile.full_name}</p>
          <p className="text-slate-500 text-xs mt-0.5">{profile.role}</p>
        </div>
        <button
          onClick={signOut}
          aria-label="Sign out"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
