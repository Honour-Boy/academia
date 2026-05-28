'use client'

import { usePathname } from 'next/navigation'
import NavBar from '@/components/ui/NavBar'
import OfflineBanner from '@/components/ui/OfflineBanner'
import type { Profile } from '@/types'

interface AppChromeProps {
  profile: Pick<Profile, 'full_name' | 'role'>
  children: React.ReactNode
}

/**
 * Authenticated chrome wrapper. Renders the public top NavBar for teachers and
 * lets /admin/* render its own AdminShell unscoped (no spacing, no top bar
 * — AdminShell provides those itself).
 */
export default function AppChrome({ profile, children }: AppChromeProps) {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')

  if (isAdmin) return <>{children}</>

  return (
    <div className="min-h-screen bg-surface-muted flex flex-col">
      <OfflineBanner />
      <NavBar profile={profile} />
      <main className="flex-1 pt-16 pb-8">{children}</main>
    </div>
  )
}
