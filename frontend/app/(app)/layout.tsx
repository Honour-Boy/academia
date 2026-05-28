import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NavBar from '@/components/ui/NavBar'
import OfflineBanner from '@/components/ui/OfflineBanner'
import AccountStatusScreen from '@/components/ui/AccountStatusScreen'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch profile for role + name + onboarding/approval status
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_active, status, onboarding_complete')
    .eq('id', user.id)
    .single()

  // Unknown user (no profile row) — force out
  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  // Signed up but hasn't completed the enrollment form yet (e.g. via Google)
  if (!profile.onboarding_complete) {
    redirect('/register')
  }

  // Awaiting admin approval — friendly holding screen (no app access)
  if (profile.status === 'pending') {
    return <AccountStatusScreen variant="pending" name={profile.full_name} />
  }

  // Admin denied the registration
  if (profile.status === 'denied') {
    return <AccountStatusScreen variant="denied" name={profile.full_name} />
  }

  // Approved but later deactivated by an admin — force out
  if (!profile.is_active) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-surface-muted flex flex-col">
      <OfflineBanner />
      <NavBar profile={profile} />
      {/* Content starts below the fixed navbar */}
      <main className="flex-1 pt-16 pb-8">
        {children}
      </main>
    </div>
  )
}
