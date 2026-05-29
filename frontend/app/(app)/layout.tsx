import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppChrome from '@/components/app/AppChrome'
import AccountStatusScreen from '@/components/ui/AccountStatusScreen'
import ViewOnlyYearBanner from '@/components/ui/ViewOnlyYearBanner'
import { getSchoolSettings } from '@/lib/school-settings'

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

  const schoolName = process.env.NEXT_PUBLIC_SCHOOL_NAME ?? 'My Dream College'

  // View-only banner — appears app-wide whenever the school's active year is
  // a past year (admin switched back to browse). Picks up the latest known
  // year from year_archives via getSchoolSettings.
  const settings = await getSchoolSettings()
  let latestYear: string | null = null
  if (settings.isViewOnlyYear) {
    const { data: archives } = await supabase
      .from('year_archives')
      .select('academic_year')
    const years = (archives ?? [])
      .map((a: { academic_year: string }) => a.academic_year)
      .filter(Boolean)
    latestYear = years.length > 0 ? years.reduce((a, b) => (a > b ? a : b)) : null
  }

  return (
    <>
      {settings.isViewOnlyYear && latestYear && (
        <ViewOnlyYearBanner currentYear={settings.currentAcademicYear} latestYear={latestYear} />
      )}
      <AppChrome profile={profile} schoolName={schoolName}>
        {children}
      </AppChrome>
    </>
  )
}
