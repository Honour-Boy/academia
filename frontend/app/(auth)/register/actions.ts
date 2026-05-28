'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { duplicateNameError, findNameConflict } from '@/lib/name-uniqueness'

type RegisterResult = { error: string } | void

interface ProfilePayload {
  fullName: string
  phone: string
  role: 'TEACHER' | 'ADMIN'
  wantsClassTeacher: boolean
  requestedClassId: string | null
  subjectIds: string[]
}

function parsePayload(formData: FormData) {
  const payload: ProfilePayload = {
    fullName: ((formData.get('full_name') as string) ?? '').trim(),
    phone: ((formData.get('phone') as string) ?? '').trim(),
    role: (formData.get('role') as 'TEACHER' | 'ADMIN') === 'ADMIN' ? 'ADMIN' : 'TEACHER',
    wantsClassTeacher: formData.get('wants_class_teacher') === 'true',
    requestedClassId: (formData.get('requested_class_id') as string) || null,
    subjectIds: (formData.getAll('subject_ids') as string[]).filter(Boolean),
  }
  return {
    ...payload,
    email: ((formData.get('email') as string) ?? '').trim().toLowerCase(),
    password: (formData.get('password') as string) ?? '',
  }
}

function validate(p: ProfilePayload): string | null {
  if (!p.fullName) return 'Please enter your full name.'
  if (!p.phone) return 'Please enter a contact number.'
  if (p.wantsClassTeacher && !p.requestedClassId)
    return 'Please select the class you are the homeroom teacher for.'
  if (p.role === 'TEACHER' && p.subjectIds.length === 0)
    return 'Please select at least one subject you teach.'
  return null
}

// Writes the registrant's choices onto their (already-existing) profile and
// records their subject requests. Always lands them in pending/inactive — the
// admin approval queue is the only thing that grants access.
async function applyProfile(
  admin: SupabaseClient,
  userId: string,
  p: ProfilePayload,
) {
  await admin
    .from('profiles')
    .update({
      full_name: p.fullName,
      phone: p.phone,
      role: p.role,
      wants_class_teacher: p.wantsClassTeacher,
      requested_class_id: p.wantsClassTeacher ? p.requestedClassId : null,
      status: 'pending',
      is_active: false,
      onboarding_complete: true,
    })
    .eq('id', userId)

  // Replace any prior subject requests (idempotent if they retry)
  await admin.from('staff_subject_requests').delete().eq('profile_id', userId)
  if (p.subjectIds.length > 0) {
    await admin
      .from('staff_subject_requests')
      .insert(p.subjectIds.map((sid) => ({ profile_id: userId, subject_id: sid })))
  }
}

/**
 * Email/password registration. Creates the auth user (the DB trigger seeds a
 * pending profile), writes the onboarding details, then signs the new user in
 * so they immediately see the "awaiting approval" holding screen.
 */
export async function registerStaffAction(formData: FormData): Promise<RegisterResult> {
  const data = parsePayload(formData)
  const err = validate(data)
  if (err) return { error: err }
  if (!data.email) return { error: 'Please enter your email address.' }
  if (data.password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const admin = createAdminClient()

  const dup = await findNameConflict(admin, data.fullName)
  if (dup.conflict) return { error: duplicateNameError(dup.conflict) }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.fullName },
  })

  if (createError) {
    if (createError.message.includes('already registered'))
      return { error: 'An account with this email already exists. Try signing in instead.' }
    return { error: 'Could not create your account. Please try again.' }
  }

  const userId = created.user?.id
  if (!userId) return { error: 'Could not create your account. Please try again.' }

  await applyProfile(admin, userId, data)

  // Sign in so the holding screen renders right away.
  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  })
  if (signInError) {
    // Account + profile exist; they can just sign in manually.
    redirect('/login?registered=1')
  }

  redirect('/dashboard')
}

/**
 * Onboarding completion for a user who is ALREADY authenticated (signed up with
 * Google). Their pending profile exists; we just fill in the details.
 */
export async function completeOnboardingAction(formData: FormData): Promise<RegisterResult> {
  const data = parsePayload(formData)
  const err = validate(data)
  if (err) return { error: err }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please start again.' }

  const admin = createAdminClient()

  // Skip own row — a Google user finishing onboarding already owns this profile.
  const dup = await findNameConflict(admin, data.fullName, { ignoreProfileId: user.id })
  if (dup.conflict) return { error: duplicateNameError(dup.conflict) }

  await applyProfile(admin, user.id, data)

  redirect('/dashboard')
}
