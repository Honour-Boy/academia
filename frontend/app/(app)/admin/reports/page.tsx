import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear, TERMS } from '@/lib/grade-utils'
import DownloadReportButton from './DownloadReportButton'

export const metadata: Metadata = { title: 'Reports' }

interface Props {
  searchParams: { term?: string; year?: string }
}

export default async function ReportsAdminPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const term = searchParams.term ?? currentTerm()
  const year = searchParams.year ?? currentAcademicYear()

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, student_number, classes!class_id(name)')
    .eq('is_active', true)
    .order('full_name')

  // Group by class name (embed is to-one; access via cast for shape stability).
  const byClass: Record<string, { id: string; full_name: string; studentNumber: string | null }[]> = {}
  for (const s of students ?? []) {
    const className = (s as any).classes?.name ?? 'Unassigned'
    if (!byClass[className]) byClass[className] = []
    byClass[className].push({
      id: (s as any).id,
      full_name: (s as any).full_name,
      studentNumber: (s as any).student_number ?? null,
    })
  }
  const classNames = Object.keys(byClass).sort()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="btn-ghost p-2 -ml-2"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="font-semibold text-ink text-xl">Reports</h1>
          <p className="text-xs text-ink-muted">{term} · {year}</p>
        </div>
      </div>

      {/* Term / year filter — plain GET form, no JS required */}
      <form method="get" className="card p-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[8rem]">
          <label htmlFor="term" className="label">Term</label>
          <select id="term" name="term" defaultValue={term} className="input mt-1">
            {TERMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[8rem]">
          <label htmlFor="year" className="label">Academic Year</label>
          <input id="year" name="year" type="text" defaultValue={year} className="input mt-1" />
        </div>
        <button type="submit" className="btn-secondary">Apply</button>
      </form>

      {classNames.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-ink-muted">No active students to report on.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {classNames.map((className) => (
            <section key={className}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
                {className} · {byClass[className].length}
              </h2>
              <div className="card divide-y divide-surface-border">
                {byClass[className].map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{s.full_name}</p>
                      {s.studentNumber && (
                        <p className="text-xs text-ink-subtle font-mono">#{s.studentNumber}</p>
                      )}
                    </div>
                    <Link
                      href={`/reports/${s.id}?term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`}
                      title="Preview report"
                      className="btn-ghost p-1.5 text-ink-muted hover:text-ink"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <DownloadReportButton
                      studentId={s.id}
                      studentName={s.full_name}
                      term={term}
                      year={year}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
