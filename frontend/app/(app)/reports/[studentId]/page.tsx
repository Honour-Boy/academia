import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGradeLetter, gradeLetterClasses } from '@/lib/grade-utils'
import { getGradingScale } from '@/lib/grading-scale-server'
import { getSchoolSettings } from '@/lib/school-settings'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import type { Grade, ScoreComponent } from '@/types'

interface Props {
  params: { studentId: string }
  searchParams: { term?: string; year?: string }
}

export const metadata: Metadata = { title: 'Report Sheet' }

export default async function ReportPage({ params, searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const settings = await getSchoolSettings()
  const term = searchParams.term ?? settings.currentTerm
  const year = searchParams.year ?? settings.currentAcademicYear
  const scale = await getGradingScale()

  // Fetch student
  const { data: student } = await supabase
    .from('students')
    .select('*, classes(name, level)')
    .eq('id', params.studentId)
    .single()

  if (!student) notFound()

  // Fetch all grades for this student this term/year
  const { data: grades } = await supabase
    .from('grades')
    .select('*, subjects(name), score_components(*)')
    .eq('student_id', params.studentId)
    .eq('term', term)
    .eq('academic_year', year)

  // Fetch all components
  const { data: components } = await supabase
    .from('score_components')
    .select('*')
    .order('sort_order')

  // Group grades by subject
  const subjectMap: Record<string, {
    subjectName: string
    scores: Record<string, number | null>  // componentId -> score
    total: number
    percentage: number
  }> = {}

  for (const g of (grades ?? []) as any[]) {
    const sid = g.subject_id
    if (!subjectMap[sid]) {
      subjectMap[sid] = { subjectName: g.subjects?.name ?? '', scores: {}, total: 0, percentage: 0 }
    }
    subjectMap[sid].scores[g.component_id] = g.score
  }

  const comps = (components ?? []) as ScoreComponent[]
  const totalMax = comps.reduce((s, c) => s + c.max_score, 0)

  const rows = Object.entries(subjectMap).map(([, info]) => {
    const total = comps.reduce((s, c) => s + (info.scores[c.id] ?? 0), 0)
    const pct   = totalMax > 0 ? (total / totalMax) * 100 : 0
    return { ...info, total, percentage: Math.round(pct * 10) / 10 }
  }).sort((a, b) => a.subjectName.localeCompare(b.subjectName))

  const overallAvg = rows.length > 0
    ? rows.reduce((s, r) => s + r.percentage, 0) / rows.length
    : 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="btn-ghost p-2 -ml-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-semibold text-ink text-lg">{student.full_name}</h1>
          <p className="text-ink-muted text-sm">{(student as any).classes?.name} · {term} · {year}</p>
        </div>
        <button
          onClick={undefined}
          className="btn-secondary gap-2 print:hidden"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Report card */}
      {/* NOTE: Layout is intentionally modular — drop in your school template here */}
      <div className="card overflow-hidden print:shadow-none print:border-0">
        {/* School header placeholder */}
        <div className="bg-sidebar text-white px-5 py-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">
            {process.env.NEXT_PUBLIC_SCHOOL_NAME ?? 'School Name'}
          </p>
          <h2 className="font-semibold text-lg">Student Report Sheet</h2>
          <p className="text-slate-400 text-sm mt-0.5">{term} — {year}</p>
        </div>

        {/* Student info strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 px-5 py-4 border-b border-surface-border bg-surface-muted text-sm">
          <div>
            <p className="text-ink-subtle text-xs mb-0.5">Name</p>
            <p className="font-medium text-ink">{student.full_name}</p>
          </div>
          <div>
            <p className="text-ink-subtle text-xs mb-0.5">Class</p>
            <p className="font-medium text-ink">{(student as any).classes?.name}</p>
          </div>
          {student.student_number && (
            <div>
              <p className="text-ink-subtle text-xs mb-0.5">Student No.</p>
              <p className="font-mono font-medium text-ink">{student.student_number}</p>
            </div>
          )}
        </div>

        {/* Grades table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left px-5 py-2.5 text-ink-muted font-medium">Subject</th>
                {comps.map((c) => (
                  <th key={c.id} className="text-center px-3 py-2.5 text-ink-muted font-medium whitespace-nowrap">
                    {c.name}<br/><span className="text-xs font-normal">/{c.max_score}</span>
                  </th>
                ))}
                <th className="text-center px-3 py-2.5 text-ink-muted font-medium">Total<br/><span className="text-xs font-normal">/{totalMax}</span></th>
                <th className="text-center px-3 py-2.5 text-ink-muted font-medium">%</th>
                <th className="text-center px-3 py-2.5 text-ink-muted font-medium">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {rows.map((row) => {
                const letter = getGradeLetter(row.percentage, scale)
                return (
                  <tr key={row.subjectName} className="hover:bg-surface-muted transition-colors">
                    <td className="px-5 py-3 font-medium text-ink">{row.subjectName}</td>
                    {comps.map((c) => (
                      <td key={c.id} className="px-3 py-3 text-center font-mono text-ink">
                        {row.scores[c.id] ?? <span className="text-ink-subtle">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center font-mono font-semibold text-ink">{row.total}</td>
                    <td className="px-3 py-3 text-center font-mono text-ink">{row.percentage}%</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`grade-badge ${gradeLetterClasses(letter)}`}>{letter}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        <div className="px-5 py-4 border-t border-surface-border bg-surface-muted flex items-center justify-between">
          <div>
            <p className="text-xs text-ink-muted">Overall Average</p>
            <p className="text-2xl font-bold font-mono text-ink">{Math.round(overallAvg * 10) / 10}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-muted mb-1">Overall Grade</p>
            <span className={`grade-badge text-base w-12 h-9 ${gradeLetterClasses(getGradeLetter(overallAvg, scale))}`}>
              {getGradeLetter(overallAvg, scale)}
            </span>
          </div>
        </div>
      </div>

      <p className="text-ink-subtle text-xs text-center mt-4">
        This report is generated from verified server data. Layout template pending — will be updated.
      </p>
    </div>
  )
}
