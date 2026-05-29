'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { validateScale, type GradingScaleRow } from '@/lib/grading-scale'

export interface ScaleInputRow {
  letter: string
  min_percentage: number
  description: string | null
}

/**
 * Replace the full grading scale atomically. Validates contiguity / ordering
 * first, then a single transaction: delete-all + insert-all. This keeps the
 * sort_order UNIQUE constraint happy (otherwise an in-place update of two
 * rows trading sort_orders would briefly violate the constraint).
 */
export async function saveGradingScaleAction(
  rows: ScaleInputRow[],
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  // Reassign sort_order from the array index so the client can just reorder
  // rows and we'll persist it. Letter is trimmed for safety.
  const candidate: GradingScaleRow[] = rows.map((r, i) => ({
    letter: r.letter.trim(),
    min_percentage: Math.round(r.min_percentage),
    description: (r.description ?? '').trim() || null,
    sort_order: i + 1,
  }))

  const check = validateScale(candidate)
  if ('error' in check) return { error: check.error }

  const { error: delErr } = await admin
    .from('grading_scale')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete-all
  if (delErr) return { error: 'Failed to reset grading scale.' }

  const { error: insErr } = await admin
    .from('grading_scale')
    .insert(candidate.map((r) => ({
      letter: r.letter,
      min_percentage: r.min_percentage,
      description: r.description,
      sort_order: r.sort_order,
      updated_by: user.id,
    })))
  if (insErr) return { error: 'Failed to save grading scale.' }

  // Every grade-display screen reads this — invalidate the app shell.
  revalidatePath('/', 'layout')
  return { success: true }
}
