import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  ChevronLeft, History, Database, CalendarDays,
} from 'lucide-react'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getSchoolSettings } from '@/lib/school-settings'
import { listYearArchives } from '@/lib/year-archives'
import ExportArchiveButton from './ExportArchiveButton'
import DeleteArchiveConfirm from './DeleteArchiveConfirm'

interface Props {
  params: { year: string }
}

export const metadata: Metadata = { title: 'Admin · Year archive' }

export default async function YearArchivePage({ params }: Props) {
  const year = decodeURIComponent(params.year)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const archives = await listYearArchives()
  if (!archives.some((a) => a.academic_year === year)) notFound()

  const { currentAcademicYear } = await getSchoolSettings()
  const isCurrent = currentAcademicYear === year

  // Counts per year-scoped table, for the "what will be deleted" preview.
  const admin = createAdminClient()
  const [
    { count: gradeCount },
    { count: subjectAssignCount },
    { count: classTeacherCount },
    { count: remarkCount },
  ] = await Promise.all([
    admin.from('grades').select('id', { count: 'exact', head: true }).eq('academic_year', year),
    admin.from('teacher_assignments').select('id', { count: 'exact', head: true }).eq('academic_year', year),
    admin.from('class_teacher_assignments').select('id', { count: 'exact', head: true }).eq('academic_year', year),
    admin.from('student_remarks').select('id', { count: 'exact', head: true }).eq('academic_year', year),
  ])

  const counts = {
    grades: gradeCount ?? 0,
    teacher_assignments: subjectAssignCount ?? 0,
    class_teacher_assignments: classTeacherCount ?? 0,
    student_remarks: remarkCount ?? 0,
  }
  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-primary transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to settings
      </Link>

      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-secondary-light text-brand-secondary-dark">
          <History className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight font-mono">{year}</h2>
          <p className="text-sm text-ink-muted mt-0.5">
            {isCurrent
              ? "This is the school's active year. Delete is blocked — switch to a different year first."
              : 'Past year. Export records before deleting to free storage.'}
          </p>
        </div>
      </div>

      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-brand-accent" />
          <h3 className="text-sm font-semibold text-ink">Records in this archive</h3>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CountCard label="Grades" value={counts.grades} />
          <CountCard label="Subject assignments" value={counts.teacher_assignments} />
          <CountCard label="Class-teacher assignments" value={counts.class_teacher_assignments} />
          <CountCard label="Remarks" value={counts.student_remarks} />
        </dl>

        {totalRows === 0 && (
          <p className="text-xs text-ink-subtle italic">
            No records left for this year. Safe to delete the archive entry.
          </p>
        )}
      </section>

      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand-accent" />
          <h3 className="text-sm font-semibold text-ink">Export</h3>
        </div>
        <p className="text-xs text-ink-muted">
          Downloads a ZIP containing CSVs for every record above. Always export before delete &mdash; once a year is deleted, the data cannot be recovered.
        </p>
        <ExportArchiveButton year={year} />
      </section>

      <section className="card p-5 sm:p-6 space-y-4 border-2 border-red-200">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-red-600" />
          <h3 className="text-sm font-semibold text-red-700">Delete archive</h3>
        </div>
        <p className="text-xs text-ink-muted">
          Permanently deletes all year-scoped records ({totalRows} row{totalRows === 1 ? '' : 's'}) for{' '}
          <span className="font-mono font-semibold text-ink">{year}</span>. Students, teachers, classes, and subjects themselves are not touched &mdash; only the per-year data.
        </p>
        <DeleteArchiveConfirm
          year={year}
          isCurrent={isCurrent}
          totalRows={totalRows}
        />
      </section>
    </div>
  )
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-2xl font-bold text-ink font-mono">{value.toLocaleString()}</p>
      <p className="text-[11px] uppercase tracking-wider text-ink-subtle mt-1">{label}</p>
    </div>
  )
}
