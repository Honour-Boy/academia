'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { duplicateNameError, findNameConflict } from '@/lib/name-uniqueness'

export async function createTeacherAction(formData: FormData) {
  const fullName = formData.get('full_name') as string
  const email    = formData.get('email') as string
  const password = formData.get('password') as string

  if (!fullName || !email || !password)
    return { error: 'All fields are required.' }

  if (password.length < 8)
    return { error: 'Password must be at least 8 characters.' }

  // Only admins can call this
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Forbidden.' }

  const normalizedEmail = email.trim().toLowerCase()

  // Use service role to create user without email confirmation
  const admin = createAdminClient()

  // Block duplicate full names (case + punctuation insensitive). See
  // lib/name-uniqueness.ts — the rule covers both staff and students.
  const dup = await findNameConflict(admin, fullName)
  if (dup.conflict) return { error: duplicateNameError(dup.conflict) }

  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (createError) {
    if (createError.message.includes('already registered'))
      return { error: 'A user with this email already exists.' }
    return { error: createError.message }
  }

  // The handle_new_user trigger creates a PENDING profile. An admin-created
  // teacher is trusted by definition — auto-approve so they get access at once,
  // skipping the self-registration queue.
  if (newUser?.user?.id) {
    await admin
      .from('profiles')
      .update({
        full_name: fullName,
        role: 'TEACHER',
        status: 'approved',
        is_active: true,
        onboarding_complete: true,
      })
      .eq('id', newUser.user.id)
  }

  revalidatePath('/admin/teachers')
  redirect('/admin/teachers')
}

export async function toggleTeacherStatusAction(
  teacherId: string,
  newStatus: boolean,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const admin = createAdminClient()
  const { data: callerProfile } = await admin
    .from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'ADMIN') return { error: 'Forbidden.' }

  // Safety rails on deactivation only — reactivating is always allowed for any
  // staff member the admin can see.
  if (!newStatus) {
    const { data: target } = await admin
      .from('profiles').select('id, role, is_active').eq('id', teacherId).single()
    if (!target) return { error: 'Account not found.' }

    if (target.role === 'ADMIN') {
      // Block admins from deactivating other admins outright — they'd have to
      // ask that admin to step down themselves.
      if (target.id !== user.id) {
        return { error: 'Admins cannot deactivate another admin\'s account. Ask them to deactivate their own.' }
      }
      // Block self-deactivation if this would leave zero active admins.
      const { count: activeAdmins } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'ADMIN')
        .eq('is_active', true)
      if ((activeAdmins ?? 0) <= 1) {
        return {
          error: 'You are the only active administrator. Promote another admin first — otherwise no one can reactivate you.',
        }
      }
    }
  }

  const { error } = await admin
    .from('profiles')
    .update({ is_active: newStatus })
    .eq('id', teacherId)

  if (error) return { error: 'Failed to update account status.' }

  revalidatePath('/admin/teachers')
  return { success: true }
}
