'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export interface ReportFieldFlags {
  show_class_average: boolean
  show_class_highest: boolean
  show_position: boolean
  show_previous_terms: boolean
}

export async function saveReportFieldSettingsAction(
  flags: ReportFieldFlags,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'Unauthorised' }

  // Single-row table — CHECK (id = 1) guarantees we only ever touch row 1.
  const { error } = await admin
    .from('report_field_settings')
    .update({
      show_class_average: !!flags.show_class_average,
      show_class_highest: !!flags.show_class_highest,
      show_position:      !!flags.show_position,
      show_previous_terms:!!flags.show_previous_terms,
      updated_by: user.id,
    })
    .eq('id', 1)

  if (error) return { error: 'Failed to save report-field settings.' }

  // Report previews on the frontend + PDF builds on the backend both read
  // these flags at render time; layout-wide revalidation is overkill but
  // cheap and keeps the admin's mental model simple.
  revalidatePath('/admin/settings')
  revalidatePath('/admin/reports')
  return { success: true }
}
