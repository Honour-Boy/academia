'use client'

import { Suspense } from 'react'
import NavBar from '@/components/ui/NavBar'
import NavProgress from '@/components/ui/NavProgress'
import OfflineBanner from '@/components/ui/OfflineBanner'
import InactivityGuard from '@/components/session/InactivityGuard'
import AdminShell from '@/components/admin/AdminShell'
import type { Profile } from '@/types'

interface AppChromeProps {
  profile: Pick<Profile, 'full_name' | 'email' | 'role'>
  schoolName: string
  /**
   * Required for admin users; ignored for teachers. Forwarded to AdminShell
   * for the approvals nav-badge.
   */
  pendingCount?: number
  children: React.ReactNode
}

export default function AppChrome({ profile, schoolName, pendingCount, children }: AppChromeProps) {
  const isAdmin = profile.role === 'ADMIN'
  const guard = <InactivityGuard role={profile.role as 'ADMIN' | 'TEACHER'} />

  if (isAdmin) {
    // AdminShell mounts on every admin route, including non-admin paths the
    // admin visits (/profile, /dashboard if they wander there) so the chrome
    // is consistent app-wide. AdminShell supplies its own NavProgress.
    return (
      <>
        <OfflineBanner />
        {guard}
        <AdminShell
          profile={{ full_name: profile.full_name, email: profile.email, role: profile.role }}
          pendingCount={pendingCount ?? 0}
          schoolName={schoolName}
        >
          {children}
        </AdminShell>
      </>
    )
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
