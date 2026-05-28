import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminShell from '@/components/admin/AdminShell'

/**
 * Admin layout — wraps every /admin/* route with the AdminShell (sidebar +
 * topbar + mobile drawer). Also enforces the ADMIN role server-side; a teacher
 * who somehow lands here is bounced back to their dashboard.
 *
 * The parent (app) layout has already verified that the user is signed in,
 * onboarded, approved, and active, so we only need the role check here.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'ADMIN') redirect('/dashboard')

  // Pending-approvals badge — flows into the sidebar nav. Counts BOTH
  // pending staff registrations and pending subject-change requests so the
  // admin sees one number for "things waiting on me".
  const [{ count: pendingProfiles }, { count: pendingChanges }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('onboarding_complete', true),
    supabase
      .from('staff_subject_change_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])
  const pendingCount = (pendingProfiles ?? 0) + (pendingChanges ?? 0)

  const schoolName = process.env.NEXT_PUBLIC_SCHOOL_NAME ?? 'My Dream College'

  return (
    <AdminShell
      profile={profile}
      pendingCount={pendingCount}
      schoolName={schoolName}
    >
      {children}
    </AdminShell>
  )
}
