import 'server-only'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { BehaviourActivityRow } from '@/lib/behaviour'

/**
 * Read active activities (sorted) using the caller's session. Inactive rows
 * are filtered out — the matrix only renders what's currently in use.
 */
export async function getActiveBehaviourActivities(): Promise<BehaviourActivityRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('behaviour_activities')
    .select('id, name, description, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data ?? []) as BehaviourActivityRow[]
}

/** All activities including soft-disabled — for the admin editor. */
export async function getAllBehaviourActivitiesAdmin(): Promise<BehaviourActivityRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('behaviour_activities')
    .select('id, name, description, sort_order, is_active')
    .order('sort_order', { ascending: true })
  return (data ?? []) as BehaviourActivityRow[]
}
