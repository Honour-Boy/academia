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

export async function toggleTeacherStatusAction(teacherId: string, newStatus: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return

  await supabase
    .from('profiles')
    .update({ is_active: newStatus })
    .eq('id', teacherId)

  revalidatePath('/admin/teachers')
}
