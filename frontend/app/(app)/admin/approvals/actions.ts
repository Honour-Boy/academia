'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return null
  return admin
}

// Approve → grants access (active + approved). The requested role is honoured.
export async function approveStaffAction(profileId: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: 'Unauthorised' }

  const { error } = await admin
    .from('profiles')
    .update({ status: 'approved', is_active: true })
    .eq('id', profileId)
    .eq('status', 'pending') // guard: only act on pending rows

  if (error) return { error: 'Failed to approve staff member.' }

  revalidatePath('/admin/approvals')
  revalidatePath('/admin')
  return { success: true }
}

// Deny → blocks access (inactive + denied). They see the "not approved" screen.
export async function denyStaffAction(profileId: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: 'Unauthorised' }

  const { error } = await admin
    .from('profiles')
    .update({ status: 'denied', is_active: false })
    .eq('id', profileId)
    .eq('status', 'pending')

  if (error) return { error: 'Failed to deny staff member.' }

  revalidatePath('/admin/approvals')
  revalidatePath('/admin')
  return { success: true }
}
