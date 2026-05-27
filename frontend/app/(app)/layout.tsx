import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NavBar from '@/components/ui/NavBar'
import OfflineBanner from '@/components/ui/OfflineBanner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch profile for role + name
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_active')
    .eq('id', user.id)
    .single()

  // Deactivated user — force out
  if (!profile || !profile.is_active) {
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
