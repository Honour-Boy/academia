import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSchoolSettings } from '@/lib/school-settings'
import { TERMS, type Term } from '@/lib/grade-utils'
import EmptyState from '@/components/ui/EmptyState'
import AuditByStudent from './AuditByStudent'

export const metadata: Metadata = { title: 'Admin · Audit log' }

// Always render fresh — an audit log must reflect the latest writes.
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: { term?: string; year?: string }
}

const TERM_ALL = 'All terms' as const

export default async function AuditPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const settings = await getSchoolSettings()

  // Available years = the school's current year ∪ every archived year. Lexical
  // sort works because YYYY/YYYY sorts correctly as a string. Descending so
  // the most recent year sits at the top of the dropdown.
  const { data: archives } = await supabase
    .from('year_archives')
    .select('academic_year')
  const yearSet = new Set<string>([settings.currentAcademicYear])
  for (const a of archives ?? []) {
    const y = (a as { academic_year: string }).academic_year
    if (y) yearSet.add(y)
  }
  const availableYears = Array.from(yearSet).sort((a, b) => (a > b ? -1 : 1))

  const selectedYear =
    searchParams.year && availableYears.includes(searchParams.year)
      ? searchParams.year
      : settings.currentAcademicYear

  // Term is optional — admins often want to see a whole year of activity at
  // once. TERM_ALL skips the join filter; an explicit term scopes the query.
  const termCandidates = [TERM_ALL, ...TERMS] as readonly string[]
  const selectedTerm =
    searchParams.term && termCandidates.includes(searchParams.term)
      ? searchParams.term
      : TERM_ALL

  // grades!inner pins the join so .eq('grades.<col>') actually filters rather
  // than left-joining with NULL. The audit log row is meaningless without its
  // underlying grade row anyway (ON DELETE CASCADE).
  let query = supabase
    .from('grade_audit_log')
    .select(`
      id, changed_by_name, old_score, new_score, action, changed_at,
      grades!grade_id!inner ( academic_year, term, student_id, students!student_id ( full_name ), subjects!subject_id ( name ) )
    `)
    .eq('grades.academic_year', selectedYear)
    .order('changed_at', { ascending: false })
    .limit(200)

  if (selectedTerm !== TERM_ALL) {
    query = query.eq('grades.term', selectedTerm as Term)
  }

  const { data: log } = await query

  const entries = (log ?? []).map((e) => ({
    id: (e as any).id as string,
    who: ((e as any).changed_by_name ?? 'Unknown') as string,
    action: (e as any).action as 'INSERT' | 'UPDATE',
    oldScore: (e as any).old_score as number | null,
    newScore: (e as any).new_score as number | null,
    changedAt: (e as any).changed_at as string,
    studentId: ((e as any).grades?.student_id ?? null) as string | null,
    student: ((e as any).grades?.students?.full_name ?? 'Unknown student') as string,
    subject: ((e as any).grades?.subjects?.name ?? 'Unknown subject') as string,
  }))

  const scopeLabel =
    selectedTerm === TERM_ALL
      ? selectedYear
      : `${selectedTerm} · ${selectedYear}`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Grade audit log</h2>
        <p className="text-sm text-ink-muted mt-1">
          Every grade insert and update is logged here. Showing the most recent 200 changes for{' '}
          <span className="font-medium text-ink">{scopeLabel}</span>, grouped by student.
        </p>
      </div>

      {/* Filter card — mirrors /admin/reports so admins get the same picker
          shape on every year-scoped page. */}
      <form method="get" className="card p-4 sm:p-5 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[10rem]">
          <label htmlFor="year" className="block text-xs font-medium uppercase tracking-wider text-ink-subtle mb-1.5">
            Academic year
          </label>
          <select id="year" name="year" defaultValue={selectedYear} className="input-brand">
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label htmlFor="term" className="block text-xs font-medium uppercase tracking-wider text-ink-subtle mb-1.5">
            Term
          </label>
          <select id="term" name="term" defaultValue={selectedTerm} className="input-brand">
            <option value={TERM_ALL}>{TERM_ALL}</option>
            {TERMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-brand">Apply</button>
      </form>

      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title={`No grade changes recorded for ${scopeLabel}`}
          description="Pick a different term or year, or wait for teachers to enter grades in this scope."
        />
      ) : (
        <AuditByStudent entries={entries} />
      )}
    </div>
  )
}
