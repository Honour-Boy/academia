import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Settings, Info, History, ChevronRight } from 'lucide-react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Term } from '@/lib/grade-utils'
import { listYearArchives } from '@/lib/year-archives'
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

  // Past-year registry — drives backward-switch in the form + the archives section.
  const archives = await listYearArchives()
  const currentYear = settings?.current_academic_year ?? '2025/2026'
  const pastYears = archives.filter((a) => a.academic_year !== currentYear)

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
            Changing the term offers to copy staffing forward. Changing the year opens the promotion wizard for forward moves, or switches to view-only for past years with records.
          </p>
        </div>

        <SettingsForm
          initialTerm={(settings?.current_term ?? 'First Term') as Term}
          initialYear={currentYear}
          knownYears={archives.map((a) => a.academic_year)}
          lastUpdatedAt={settings?.updated_at ?? null}
          lastUpdatedBy={lastUpdatedBy}
        />
      </div>

      {/* Year archives — past years the school has data for */}
      <div className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-secondary-light text-brand-secondary-dark">
            <History className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-ink">Year archives</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Past academic years with records. Browse in view-only mode, export, or delete to free up storage.
            </p>
          </div>
        </div>

        {pastYears.length === 0 ? (
          <p className="text-sm text-ink-muted italic">
            No past years on file yet — once you roll over to a new year via the wizard, this list will populate.
          </p>
        ) : (
          <ul className="divide-y divide-surface-border rounded-lg ring-1 ring-surface-border overflow-hidden">
            {pastYears.map((y) => (
              <li key={y.academic_year} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink font-mono">{y.academic_year}</p>
                  <p className="text-[11px] text-ink-subtle">
                    First seen {new Date(y.first_seen_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/admin/settings/year-archives/${encodeURIComponent(y.academic_year)}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:text-brand-primary-dark cursor-pointer"
                >
                  Manage <ChevronRight className="w-3 h-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-lg bg-brand-primary-light/40 border border-brand-primary/20 px-3 py-2 text-xs text-brand-primary-dark flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            To switch the active year to a past one (view-only), enter it in the year field above and save &mdash; the wizard will skip promotion since the year already has records.
          </span>
        </div>
      </div>
    </div>
  )
}
