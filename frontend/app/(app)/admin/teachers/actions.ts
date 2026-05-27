'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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

  // Use service role to create user without email confirmation
  const admin = createAdminClient()
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'TEACHER' },
  })

  if (createError) {
    if (createError.message.includes('already registered'))
      return { error: 'A user with this email already exists.' }
    return { error: createError.message }
  }

  // Profile is auto-created by the DB trigger (handle_new_user)
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
