'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import NavBar from '@/components/ui/NavBar'
import NavProgress from '@/components/ui/NavProgress'
import OfflineBanner from '@/components/ui/OfflineBanner'
import InactivityGuard from '@/components/session/InactivityGuard'
import type { Profile } from '@/types'

interface AppChromeProps {
  profile: Pick<Profile, 'full_name' | 'role'>
  schoolName: string
  children: React.ReactNode
}

export default function AppChrome({ profile, schoolName, children }: AppChromeProps) {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')

  // Inactivity guard applies to BOTH admin and teacher surfaces. Admin pages
  // render their own chrome (AdminShell) so we still need to inject the guard
  // here for them — wrap children in a fragment with the guard alongside.
  const guard = <InactivityGuard role={profile.role as 'ADMIN' | 'TEACHER'} />

  if (isAdmin) {
    return <>{guard}{children}</>
  }

  return (
    <div className="min-h-screen bg-surface-muted flex flex-col">
      <Suspense fallback={null}><NavProgress /></Suspense>
      <OfflineBanner />
      {guard}
      <NavBar profile={profile} schoolName={schoolName} />
      <main className="flex-1 pt-[68px] pb-8">{children}</main>
    </div>
  )
}
