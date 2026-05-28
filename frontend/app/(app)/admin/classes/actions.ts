'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Result = { error: string } | { ok: true }

const LEVEL_OPTIONS = new Set(['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'])
const ARM_OPTIONS = new Set(['A', 'B', 'C', 'D', 'E', 'F'])

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'ADMIN' ? user : null
}

/**
 * Create a class. Composes `name` from level + arm (e.g. "JSS 1" + "A" → "JSS 1A")
 * and stores both pieces. Bypasses RLS via the admin client.
 */
export async function createClassAction(formData: FormData): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { error: 'Not authorised.' }

  const level = (formData.get('level') as string)?.trim()
  const arm = (formData.get('arm') as string)?.trim().toUpperCase()

  if (!level || !LEVEL_OPTIONS.has(level)) return { error: 'Please pick a class level.' }
  if (!arm || !ARM_OPTIONS.has(arm)) return { error: 'Please pick an arm (A–F).' }

  const name = `${level}${arm}` // e.g. "JSS 1A"

  const admin = createAdminClient()

  // Reject duplicates (same name).
  const { data: existing } = await admin
    .from('classes')
    .select('id')
    .eq('name', name)
    .maybeSingle()
  if (existing) return { error: `${name} already exists.` }

  const { error } = await admin
    .from('classes')
    .insert({ name, level, arm, created_by: user.id })

  if (error) return { error: 'Could not create the class. Please try again.' }

  revalidatePath('/admin/classes')
  revalidatePath('/admin')
  return { ok: true }
}
