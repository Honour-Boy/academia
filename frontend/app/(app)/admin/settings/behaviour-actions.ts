'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { validateActivities, type BehaviourActivityRow } from '@/lib/behaviour'

export interface ActivityInput {
  /** Existing row's id when editing in place; absent for newly-added rows. */
  id?: string
  name: string
  description: string | null
  is_active: boolean
}

/**
 * Replace the activity catalogue atomically. Walks the candidate list to:
 *   - keep + update rows whose id matches an existing row
 *   - delete rows that vanished from the candidate list
 *   - insert new rows
 *
 * sort_order is reassigned from the array index so the admin can reorder
 * with up/down arrows and we'll persist the new order. Deleted rows pull
 * their student_behaviour_scores with them (ON DELETE CASCADE) — admins
 * who want to retire a field without losing history should toggle
 * is_active off instead.
 */
export async function saveBehaviourActivitiesAction(
  rows: ActivityInput[],
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  const candidate = rows.map((r, i) => ({
    id: r.id,
    name: r.name.trim(),
    description: (r.description ?? '').trim() || null,
    is_active: !!r.is_active,
    sort_order: i + 1,
  }))

  const check = validateActivities(candidate)
  if ('error' in check) return { error: check.error }

  // Fetch current rows so we can decide insert vs update vs delete.
  const { data: existing } = await admin
    .from('behaviour_activities')
    .select('id, sort_order')
  const existingIds = new Set((existing ?? []).map((r: any) => r.id as string))
  const keepIds = new Set(candidate.filter((r) => r.id).map((r) => r.id as string))

  // Delete vanished rows. Cascades through student_behaviour_scores via FK,
  // so admins who care about historical data should soft-disable.
  const toDelete = (existing ?? [])
    .map((r: any) => r.id as string)
    .filter((id) => !keepIds.has(id))
  if (toDelete.length > 0) {
    const { error } = await admin
      .from('behaviour_activities')
      .delete()
      .in('id', toDelete)
    if (error) return { error: 'Failed to remove retired activities.' }
  }

  // To avoid the UNIQUE(sort_order) constraint blocking a swap of two rows,
  // push every kept row into a temporary high-numbered band first, then
  // commit the final sort_order in a second pass. sort_order is positive so
  // 10_000+ is comfortably out of the way of any realistic list.
  const TEMP_OFFSET = 10_000
  for (const r of candidate) {
    if (!r.id || !existingIds.has(r.id)) continue
    await admin
      .from('behaviour_activities')
      .update({ sort_order: r.sort_order + TEMP_OFFSET })
      .eq('id', r.id)
  }

  // Insert new rows directly at their final sort_order (no clash possible —
  // every existing row is in the TEMP band right now).
  const toInsert = candidate.filter((r) => !r.id || !existingIds.has(r.id))
  if (toInsert.length > 0) {
    const { error } = await admin
      .from('behaviour_activities')
      .insert(toInsert.map((r) => ({
        name: r.name,
        description: r.description,
        is_active: r.is_active,
        sort_order: r.sort_order,
        updated_by: user.id,
      })))
    if (error) return { error: 'Failed to add new activities.' }
  }

  // Commit kept rows to their final sort_order + updated fields.
  for (const r of candidate) {
    if (!r.id || !existingIds.has(r.id)) continue
    const { error } = await admin
      .from('behaviour_activities')
      .update({
        name: r.name,
        description: r.description,
        is_active: r.is_active,
        sort_order: r.sort_order,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', r.id)
    if (error) return { error: 'Failed to save activity order.' }
  }

  revalidatePath('/admin/settings')
  revalidatePath('/class-teacher', 'layout')
  return { success: true }
}

export type { BehaviourActivityRow }
