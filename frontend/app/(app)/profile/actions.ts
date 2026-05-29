'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { duplicateNameError, findNameConflict } from '@/lib/name-uniqueness'

// Nigeria-friendly phone validation: digits, spaces, dashes, optional +234, +44, etc.
// Just enough to reject obvious junk; don't try to be a full phone library.
function isValidPhone(value: string): boolean {
  const stripped = value.replace(/[\s-]/g, '')
  return /^\+?\d{7,15}$/.test(stripped)
}

export async function updateProfileAction(formData: FormData): Promise<
  { error: string } | { success: true; nameChanged: boolean }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fullName = ((formData.get('full_name') as string) ?? '').trim()
  const phone = ((formData.get('phone') as string) ?? '').trim()

  if (!fullName) return { error: 'Full name is required.' }
  if (phone && !isValidPhone(phone)) {
    return { error: 'Phone number looks invalid. Use digits with optional +country code.' }
  }

  // Duplicate-name check needs the admin client — RLS hides other profiles
  // from a regular signed-in user.
  const admin = createAdminClient()
  const dup = await findNameConflict(admin, fullName, { ignoreProfileId: user.id })
  if (dup.conflict) return { error: duplicateNameError(dup.conflict) }

  const { error } = await admin
    .from('profiles')
    .update({ full_name: fullName, phone: phone || null })
    .eq('id', user.id)

  if (error) return { error: 'Failed to update profile. Try again.' }

  // The user's name appears in chrome on every page — bust the layout cache.
  revalidatePath('/', 'layout')
  return { success: true, nameChanged: true }
}

export async function updatePasswordAction(formData: FormData): Promise<
  { error: string } | { success: true }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const current = (formData.get('current_password') as string) ?? ''
  const next = (formData.get('new_password') as string) ?? ''
  const confirm = (formData.get('confirm_password') as string) ?? ''

  if (!current) return { error: 'Enter your current password to confirm the change.' }
  if (next.length < 8) return { error: 'New password must be at least 8 characters.' }
  if (next !== confirm) return { error: 'New password and confirmation do not match.' }
  if (current === next) return { error: 'New password must be different from the current one.' }

  // Re-authenticate with the current password before changing it. Supabase
  // doesn't enforce this server-side, but skipping it lets a leaked session
  // change a password silently. signInWithPassword refreshes the session, so
  // it doesn't break the in-flight request either.
  if (!user.email) return { error: 'Your account has no email on file.' }
  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  })
  if (reauth.error) return { error: 'Current password is incorrect.' }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { error: 'Failed to update password. Try again.' }

  return { success: true }
}

/**
 * Initial password set for OAuth-only users (signed up via Google, never had
 * a Supabase password). The standard `updatePasswordAction` requires a
 * current-password re-auth, which OAuth users would always fail.
 *
 * Security trade-off: there's no current-password defense here, so a stolen
 * session token could set a password. That's an inherent property of having
 * no password to re-auth against — the same exposure Supabase itself has for
 * OAuth accounts. For users with a password, the regular change-password
 * path is used and the re-auth defence still applies.
 */
export async function setInitialPasswordAction(formData: FormData): Promise<
  { error: string } | { success: true }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const next = (formData.get('new_password') as string) ?? ''
  const confirm = (formData.get('confirm_password') as string) ?? ''

  if (next.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (next !== confirm) return { error: 'Password and confirmation do not match.' }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { error: 'Failed to set password. Try again.' }

  // Bust the layout cache so the next render refetches the user object and
  // (if Supabase adds the email identity after a password set) the password
  // form switches to the regular change-password mode.
  revalidatePath('/profile')
  return { success: true }
}

// ── Session management ───────────────────────────────────────────────────────

/**
 * Sign out every other device for this user, keeping the current browser
 * signed in. Supabase's 'others' scope revokes all refresh tokens except the
 * one in the current request.
 */
export async function signOutOtherSessionsAction(): Promise<
  { error: string } | { success: true }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) return { error: 'Failed to sign out other devices.' }

  return { success: true }
}

/**
 * Sign out everywhere INCLUDING the current device. The browser will be
 * bounced to /login on the next render once the client picks up SIGNED_OUT.
 */
export async function signOutEverywhereAction(): Promise<
  { error: string } | { success: true }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.auth.signOut({ scope: 'global' })
  if (error) return { error: 'Failed to sign out everywhere.' }

  // The next layout render will see no session and redirect anyway, but
  // forcing it here keeps the UX tight if the action returns inline.
  redirect('/login?reason=signed-out-everywhere')
}

// ── Subject change request (teacher → admin) ─────────────────────────────────

/**
 * Submit (or replace) a pending subject-change request. Teacher picks the
 * full new list of subjects they want to teach; admin reviews and approves
 * via /admin/approvals. The partial-unique index on staff_subject_change_requests
 * ensures at most one pending request per teacher.
 */
export async function submitSubjectChangeRequestAction(input: {
  subjectIds: string[]
}): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (input.subjectIds.length === 0) {
    return { error: 'Pick at least one subject — to drop all subjects, ask an admin.' }
  }

  const admin = createAdminClient()

  // Replace any existing pending request — there can only be one at a time
  // (partial unique index), so wipe first then insert clean.
  await admin
    .from('staff_subject_change_requests')
    .delete()
    .eq('profile_id', user.id)
    .eq('status', 'pending')

  const { data: req, error: insErr } = await admin
    .from('staff_subject_change_requests')
    .insert({ profile_id: user.id, status: 'pending' })
    .select('id')
    .single()
  if (insErr || !req) return { error: 'Failed to submit your request. Try again.' }

  const { error: subjErr } = await admin
    .from('staff_subject_change_request_subjects')
    .insert(input.subjectIds.map((sid) => ({ request_id: req.id, subject_id: sid })))
  if (subjErr) {
    // Undo the parent row so we don't leave a half-formed request.
    await admin.from('staff_subject_change_requests').delete().eq('id', req.id)
    return { error: 'Failed to save proposed subjects.' }
  }

  revalidatePath('/profile')
  revalidatePath('/admin/approvals')
  return { success: true }
}

/** Withdraw an in-flight pending request. */
export async function cancelSubjectChangeRequestAction(
  requestId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { error } = await admin
    .from('staff_subject_change_requests')
    .delete()
    .eq('id', requestId)
    .eq('profile_id', user.id)
    .eq('status', 'pending')
  if (error) return { error: 'Failed to cancel the request.' }

  revalidatePath('/profile')
  revalidatePath('/admin/approvals')
  return { success: true }
}
