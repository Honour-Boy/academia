import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TERMS } from '@/lib/grade-utils'
import { getSchoolSettings } from '@/lib/school-settings'
import EmptyState from '@/components/ui/EmptyState'
import DownloadGradesCSVButton from './DownloadGradesCSVButton'
import ReportsBrowser, { type ReportRow } from './ReportsBrowser'

export const metadata: Metadata = { title: 'Admin · Reports' }

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

  const settings = await getSchoolSettings()
  const term = searchParams.term ?? settings.currentTerm
  const year = searchParams.year ?? settings.currentAcademicYear

  const [{ data: students }, { data: remarks }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, student_number, classes!class_id(name)')
      .eq('is_active', true)
      .order('full_name'),
    // Pull just the principal_remark column for this term/year so the
    // per-row button can preload its current value. Filter by student
    // happens client-side.
    supabase
      .from('student_remarks')
      .select('student_id, principal_remark')
      .eq('term', term)
      .eq('academic_year', year),
  ])

  const principalRemarkByStudent = new Map<string, string | null>()
  for (const r of remarks ?? []) {
    const sid = (r as any).student_id as string
    principalRemarkByStudent.set(sid, ((r as any).principal_remark ?? null) as string | null)
  }

  const reportRows: ReportRow[] = (students ?? []).map((s: any) => ({
    id: s.id as string,
    full_name: s.full_name as string,
    studentNumber: (s.student_number ?? null) as string | null,
    className: s.classes?.name ?? 'Unassigned',
    principalRemark: principalRemarkByStudent.get(s.id as string) ?? null,
  }))
  const totalStudents = reportRows.length

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Report sheets</h2>
          <p className="text-sm text-ink-muted mt-1">
            Preview or download student report PDFs for <span className="font-medium text-ink">{term} · {year}</span>.
            {totalStudents > 0 && ` ${totalStudents} active ${totalStudents === 1 ? 'student' : 'students'}.`}
          </p>
        </div>
        {totalStudents > 0 && <DownloadGradesCSVButton term={term} year={year} />}
      </div>

      {/* Filter card */}
      <form method="get" className="card p-4 sm:p-5 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[10rem]">
          <label htmlFor="term" className="block text-xs font-medium uppercase tracking-wider text-ink-subtle mb-1.5">
            Term
          </label>
          <select id="term" name="term" defaultValue={term} className="input-brand">
            {TERMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label htmlFor="year" className="block text-xs font-medium uppercase tracking-wider text-ink-subtle mb-1.5">
            Academic year
          </label>
          <input
            id="year"
            name="year"
            type="text"
            placeholder="2025/2026"
            defaultValue={year}
            className="input-brand"
          />
        </div>
        <button type="submit" className="btn-brand">Apply</button>
      </form>

      {reportRows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No students to report on"
          description="Enrol students first, then come back here to preview and download their report sheets."
          primaryAction={{ label: 'Enrol a student', href: '/admin/students/new' }}
        />
      ) : (
        <ReportsBrowser rows={reportRows} term={term} year={year} />
      )}
    </div>
  )
}
