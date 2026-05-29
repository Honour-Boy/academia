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

// ── Subject change requests ──────────────────────────────────────────────────

/**
 * Approve a pending subject-change request: replace the teacher's
 * staff_subject_requests rows with the proposed list, mark the request approved,
 * and stamp the reviewer. The grade-entry / matrix filters all read from
 * staff_subject_requests so the change takes effect immediately.
 */
export async function approveSubjectChangeAction(requestId: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: 'Unauthorised' }

  // Pull the request + proposed subjects atomically.
  const { data: req } = await admin
    .from('staff_subject_change_requests')
    .select('id, profile_id, status')
    .eq('id', requestId)
    .eq('status', 'pending')
    .maybeSingle()
  if (!req) return { error: 'Request not found or already reviewed.' }

  const { data: proposed } = await admin
    .from('staff_subject_change_request_subjects')
    .select('subject_id')
    .eq('request_id', requestId)
  const subjectIds = (proposed ?? []).map((r) => r.subject_id as string)

  // Replace the teacher's registered subjects with the proposed list.
  await admin.from('staff_subject_requests').delete().eq('profile_id', req.profile_id)
  if (subjectIds.length > 0) {
    const { error: insErr } = await admin
      .from('staff_subject_requests')
      .insert(subjectIds.map((sid) => ({ profile_id: req.profile_id, subject_id: sid })))
    if (insErr) return { error: 'Failed to apply the new subject list.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error: statusErr } = await admin
    .from('staff_subject_change_requests')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq('id', requestId)
  if (statusErr) return { error: 'Applied changes but failed to mark approved.' }

  revalidatePath('/admin/approvals')
  revalidatePath('/admin')
  revalidatePath('/admin/teachers')
  revalidatePath('/admin/assignments')
  return { success: true }
}

/** Deny a subject-change request — no DB writes to staff_subject_requests. */
export async function denySubjectChangeAction(requestId: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: 'Unauthorised' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await admin
    .from('staff_subject_change_requests')
    .update({
      status: 'denied',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
  if (error) return { error: 'Failed to deny the request.' }

  revalidatePath('/admin/approvals')
  revalidatePath('/admin')
  return { success: true }
}
