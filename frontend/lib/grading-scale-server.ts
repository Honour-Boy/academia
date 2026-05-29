import 'server-only'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_GRADING_SCALE, type GradingScaleRow } from '@/lib/grading-scale'

/**
 * Read the configured grading scale, ordered top → bottom (A1 first). Reads
 * are open to every authed user via RLS. Returns the migration defaults if
 * the table somehow ends up empty so the UI keeps rendering.
 *
 * Server-only — uses Next.js cookies(). For client components import the
 * pure helpers from `lib/grading-scale.ts` instead and have the parent
 * server component fetch the scale.
 */
export async function getGradingScale(): Promise<GradingScaleRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grading_scale')
    .select('letter, min_percentage, description, sort_order')
    .order('sort_order', { ascending: true })
  if (error || !data || data.length === 0) return DEFAULT_GRADING_SCALE
  return data as GradingScaleRow[]
}

/**
 * Service-role read for backend / admin code that needs the scale without
 * a user session.
 */
export async function getGradingScaleAdmin(): Promise<GradingScaleRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('grading_scale')
    .select('letter, min_percentage, description, sort_order')
    .order('sort_order', { ascending: true })
  if (error || !data || data.length === 0) return DEFAULT_GRADING_SCALE
  return data as GradingScaleRow[]
}
