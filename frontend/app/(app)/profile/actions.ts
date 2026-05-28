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
