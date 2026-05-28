import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSchoolSettings } from '@/lib/school-settings'
import EmptyState from '@/components/ui/EmptyState'
import { Users } from 'lucide-react'
import RolloverWizard, { type ClassRow, type StudentRow } from './RolloverWizard'

export const metadata: Metadata = { title: 'Admin · Year rollover' }

interface Props {
  searchParams: { newYear?: string }
}

export default async function YearRolloverPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { currentAcademicYear } = await getSchoolSettings()
  const newYear = searchParams.newYear?.trim() || ''

  // If the admin lands here without picking a new year first, bounce them to
  // settings — the wizard needs to know what year it's promoting *into*.
  if (!newYear || newYear === currentAcademicYear) {
    redirect('/admin/settings')
  }

  const [{ data: students }, { data: classes }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, student_number, classes!class_id(id, name, level, arm)')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('classes')
      .select('id, name, level, arm')
      .order('level').order('arm'),
  ])

  const studentRows: StudentRow[] = (students ?? []).map((s: any) => ({
    id: s.id,
    fullName: s.full_name,
    studentNumber: s.student_number ?? null,
    currentClassId: s.classes?.id ?? '',
    currentClassName: s.classes?.name ?? '—',
    currentLevel: s.classes?.level ?? '',
    currentArm: s.classes?.arm ?? '',
  }))

  const classRows: ClassRow[] = (classes ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    arm: c.arm,
  }))

  return (
    <div className="space-y-6">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-primary transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to settings
      </Link>

      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-secondary-light text-brand-secondary-dark">
          <CalendarClock className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Year rollover</h2>
          <p className="text-sm text-ink-muted mt-0.5">
            <span className="font-mono">{currentAcademicYear}</span> &rarr;{' '}
            <span className="font-mono font-semibold text-ink">{newYear}</span>
            {' '}&middot; Decide what happens to each student before the new year takes effect.
          </p>
        </div>
      </div>

      {studentRows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No active students"
          description="There are no active students to promote. The year change can be saved without a wizard — head back to settings."
        />
      ) : (
        <RolloverWizard
          students={studentRows}
          classes={classRows}
          currentYear={currentAcademicYear}
          newYear={newYear}
        />
      )}
    </div>
  )
}
