import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Admin layout — enforces the ADMIN role server-side; a teacher who somehow
 * lands on `/admin/*` is bounced back to their dashboard.
 *
 * AdminShell (sidebar + topbar + mobile drawer) is now mounted at the parent
 * `(app)/layout.tsx` for admin users via `AppChrome`, so the chrome stays
 * consistent on `/profile` and any other non-admin route an admin visits.
 * Don't re-wrap here — that would double the sidebar.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'ADMIN') redirect('/dashboard')

  return <>{children}</>
}
