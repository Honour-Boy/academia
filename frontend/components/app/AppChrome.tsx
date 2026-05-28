'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import NavBar from '@/components/ui/NavBar'
import NavProgress from '@/components/ui/NavProgress'
import OfflineBanner from '@/components/ui/OfflineBanner'
import type { Profile } from '@/types'

interface AppChromeProps {
  profile: Pick<Profile, 'full_name' | 'role'>
  schoolName: string
  children: React.ReactNode
}

export default function AppChrome({ profile, schoolName, children }: AppChromeProps) {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')

  if (isAdmin) return <>{children}</>

  return (
    <div className="min-h-screen bg-surface-muted flex flex-col">
      <Suspense fallback={null}><NavProgress /></Suspense>
      <OfflineBanner />
      <NavBar profile={profile} schoolName={schoolName} />
      <main className="flex-1 pt-[68px] pb-8">{children}</main>
    </div>
  )
}
