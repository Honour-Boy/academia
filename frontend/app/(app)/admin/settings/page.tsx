import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Settings, Info } from 'lucide-react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Term } from '@/lib/grade-utils'
import SettingsForm from './SettingsForm'

export const metadata: Metadata = { title: 'Admin · Settings' }

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  // School settings are readable by every authed user, but joining
  // updated_by → profiles.full_name needs the admin client (RLS hides other
  // people's profile rows).
  const admin = createAdminClient()
  const { data: settings } = await admin
    .from('school_settings')
    .select('current_term, current_academic_year, updated_at, updated_by')
    .eq('id', 1)
    .maybeSingle()

  let lastUpdatedBy: string | null = null
  if (settings?.updated_by) {
    const { data: updater } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', settings.updated_by)
      .maybeSingle()
    lastUpdatedBy = updater?.full_name ?? null
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-accent/10 text-brand-accent">
          <Settings className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Settings</h2>
          <p className="text-sm text-ink-muted mt-0.5">
            School-wide values that every dashboard, grade page, and report sheet reads.
          </p>
        </div>
      </div>

      <div className="card p-5 sm:p-6 space-y-5">
        <div>
          <h3 className="text-base font-semibold text-ink">Current term and academic year</h3>
          <p className="text-xs text-ink-muted mt-1">
            Changing the term affects which assignments and grades teachers see. Changing the year is a fresh-start rollover.
          </p>
        </div>

        <div className="rounded-lg bg-brand-secondary-light border border-brand-secondary/30 px-4 py-3 text-xs text-brand-accent-dark flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Carry-forward (copy assignments from the old term to the new one) and a year-rollover promotion wizard are coming in a follow-up. For now, changing these values just retargets every screen that uses them &mdash; previous-term data stays intact in the database.
          </span>
        </div>

        <SettingsForm
          initialTerm={(settings?.current_term ?? 'First Term') as Term}
          initialYear={settings?.current_academic_year ?? '2025/2026'}
          lastUpdatedAt={settings?.updated_at ?? null}
          lastUpdatedBy={lastUpdatedBy}
        />
      </div>
    </div>
  )
}
