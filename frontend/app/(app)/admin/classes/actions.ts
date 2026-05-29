'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Result = { error: string } | { ok: true }

const LEVEL_OPTIONS = new Set(['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'])

// Arm names are admin-controlled — accept any 1-20 char trimmed string so
// schools can use "Topaz" / "Emerald" / "Eta" etc. The old A–F enum was a
// hard-coded UI constraint, not a database one.
const ARM_PATTERN = /^[A-Za-z0-9 ][A-Za-z0-9 .\-_]{0,19}$/
function normalizeArm(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}
function isValidArm(arm: string): boolean {
  return ARM_PATTERN.test(arm) && arm.length > 0 && arm.length <= 20
}

/**
 * "JSS 1" + "A" → "JSS 1A" (no space — keeps the legacy naming).
 * "JSS 1" + "Topaz" → "JSS 1 Topaz" (space — multi-letter arms read better).
 */
function composeName(level: string, arm: string): string {
  return arm.length === 1 ? `${level}${arm}` : `${level} ${arm}`
}

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
  const armRaw = (formData.get('arm') as string) ?? ''
  const arm = normalizeArm(armRaw)

  if (!level || !LEVEL_OPTIONS.has(level)) return { error: 'Please pick a class level.' }
  if (!isValidArm(arm)) {
    return { error: 'Arm must be 1–20 characters (letters, digits, spaces, . - _).' }
  }

  const name = composeName(level, arm)

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

/**
 * Rename a class's arm (and auto-update display name). Used by the admin
 * arm editor — e.g. "JSS 1A" → "JSS 1 Topaz" by changing arm from "A" to
 * "Topaz". Level stays fixed.
 */
export async function updateClassArmAction(
  classId: string,
  newArm: string,
): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { error: 'Not authorised.' }

  const arm = normalizeArm(newArm)
  if (!isValidArm(arm)) {
    return { error: 'Arm must be 1–20 characters (letters, digits, spaces, . - _).' }
  }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('classes')
    .select('id, level, arm, name')
    .eq('id', classId)
    .maybeSingle()
  if (!current) return { error: 'Class not found.' }

  if (current.arm === arm) return { ok: true }

  const newName = composeName(current.level, arm)
  const { data: clash } = await admin
    .from('classes')
    .select('id')
    .eq('name', newName)
    .neq('id', classId)
    .maybeSingle()
  if (clash) return { error: `${newName} already exists.` }

  const { error } = await admin
    .from('classes')
    .update({ arm, name: newName })
    .eq('id', classId)
  if (error) return { error: 'Could not rename the class.' }

  revalidatePath('/admin/classes')
  revalidatePath('/admin')
  revalidatePath('/admin/students')
  return { ok: true }
}

/**
 * Delete a class. Blocks the delete when any students are still enrolled
 * (active OR deactivated) so historical grade references don't break. Admin
 * should reassign / archive students first.
 */
export async function deleteClassAction(classId: string): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { error: 'Not authorised.' }

  const admin = createAdminClient()
  const { count: studentCount } = await admin
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
  if ((studentCount ?? 0) > 0) {
    return {
      error: `Can't delete — ${studentCount} student${studentCount === 1 ? ' is' : 's are'} still in this class. Move them to another class first.`,
    }
  }

  // class_teacher_assignments + teacher_assignments will cascade or restrict
  // depending on FK. We clear them defensively so a stray current-term row
  // doesn't block the delete with a foreign-key error.
  await admin.from('class_teacher_assignments').delete().eq('class_id', classId)
  await admin.from('teacher_assignments').delete().eq('class_id', classId)

  const { error } = await admin.from('classes').delete().eq('id', classId)
  if (error) return { error: 'Could not delete the class.' }

  revalidatePath('/admin/classes')
  revalidatePath('/admin')
  return { ok: true }
}
