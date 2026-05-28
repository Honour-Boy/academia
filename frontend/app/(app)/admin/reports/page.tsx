import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Eye, FileText, GraduationCap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear, TERMS } from '@/lib/grade-utils'
import EmptyState from '@/components/ui/EmptyState'
import DownloadReportButton from './DownloadReportButton'
import DownloadGradesCSVButton from './DownloadGradesCSVButton'

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

  const term = searchParams.term ?? currentTerm()
  const year = searchParams.year ?? currentAcademicYear()

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, student_number, classes!class_id(name)')
    .eq('is_active', true)
    .order('full_name')

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
  const totalStudents = (students ?? []).length

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

      {classNames.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No students to report on"
          description="Enrol students first, then come back here to preview and download their report sheets."
          primaryAction={{ label: 'Enrol a student', href: '/admin/students/new' }}
        />
      ) : (
        <div className="space-y-6">
          {classNames.map((className) => (
            <section key={className}>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
                <GraduationCap className="w-3.5 h-3.5" /> {className}
                <span className="ml-1 text-ink-subtle/70">· {byClass[className].length}</span>
              </h3>
              <div className="card divide-y divide-surface-border overflow-hidden">
                {byClass[className].map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-surface-muted/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{s.full_name}</p>
                      {s.studentNumber && (
                        <p className="text-xs text-ink-subtle font-mono mt-0.5">#{s.studentNumber}</p>
                      )}
                    </div>
                    <Link
                      href={`/reports/${s.id}?term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`}
                      aria-label={`Preview ${s.full_name}'s report`}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors"
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
