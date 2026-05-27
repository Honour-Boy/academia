import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { currentTerm, currentAcademicYear } from '@/lib/grade-utils'
import { updateStudentAction } from '../actions'

export const metadata: Metadata = { title: 'Edit Student' }

interface Props { params: { id: string } }

export default async function EditStudentPage({ params }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const term = currentTerm()
  const year = currentAcademicYear()

  const [
    { data: student },
    { data: classes },
    { data: subjects },
    { data: enrolled },
    { data: ctas },
  ] = await Promise.all([
    supabase
      .from('students')
      .select('*, classes(id, name)')
      .eq('id', params.id)
      .single(),
    supabase.from('classes').select('*').order('name'),
    supabase.from('subjects').select('*').order('name'),
    supabase
      .from('student_subjects')
      .select('subject_id')
      .eq('student_id', params.id),
    supabase
      .from('class_teacher_assignments')
      .select('class_id, profiles!teacher_id(full_name)')
      .eq('term', term)
      .eq('academic_year', year),
  ])

  if (!student) notFound()

  const enrolledIds = new Set((enrolled ?? []).map((e: any) => e.subject_id))
  const ctaMap: Record<string, string | null> = {}
  for (const cta of ctas ?? []) ctaMap[(cta as any).class_id] = (cta as any).profiles?.full_name ?? null

  const updateWithId = updateStudentAction.bind(null, params.id)

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/students" className="btn-ghost p-2 -ml-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-semibold text-ink text-xl">Edit Student</h1>
      </div>

      <div className="card p-5">
        <form action={updateWithId} className="space-y-5">
          <div>
            <label htmlFor="full_name" className="label">Full Name</label>
            <input
              id="full_name" name="full_name" type="text" required
              defaultValue={student.full_name} className="input mt-1"
            />
          </div>

          <div>
            <label htmlFor="student_number" className="label">Student Number</label>
            <input
              id="student_number" name="student_number" type="text"
              defaultValue={student.student_number ?? ''} className="input mt-1"
            />
          </div>

          <div>
            <label htmlFor="class_id" className="label">Assigned Class</label>
            <select id="class_id" name="class_id" required defaultValue={student.class_id} className="input mt-1">
              {(classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {ctaMap[student.class_id] && (
              <p className="mt-1 text-xs text-ink-muted">
                Class Teacher: <span className="font-medium">{ctaMap[student.class_id]}</span>
              </p>
            )}
          </div>

          <div>
            <p className="label mb-2">Subjects Offered</p>
            <div className="card p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
              {(subjects ?? []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                  <input
                    type="checkbox" name="subject_ids" value={s.id}
                    defaultChecked={enrolledIds.has(s.id)}
                    className="w-4 h-4 accent-brand rounded"
                  />
                  <span className="text-ink">{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1">Save Changes</button>
            <Link href="/admin/students" className="btn-secondary flex-1 text-center">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
