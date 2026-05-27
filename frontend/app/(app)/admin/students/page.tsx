import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ArrowLeft, Plus, UserCheck, UserX } from 'lucide-react'
import { setStudentActiveAction } from './actions'

export const metadata: Metadata = { title: 'Students' }

export default async function StudentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { data: students } = await supabase
    .from('students')
    .select(`
      id, full_name, student_number, is_active, created_at,
      classes(id, name, level, arm)
    `)
    .order('full_name')

  const active   = students?.filter((s) => s.is_active) ?? []
  const inactive = students?.filter((s) => !s.is_active) ?? []

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="btn-ghost p-2 -ml-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="flex-1 font-semibold text-ink text-xl">Students</h1>
        <Link href="/admin/students/new" className="btn-primary gap-1.5">
          <Plus className="w-4 h-4" /> Enroll student
        </Link>
      </div>

      {students?.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-ink-muted">No students enrolled yet.</p>
          <Link href="/admin/students/new" className="btn-primary mt-4 inline-flex">
            Enroll first student
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <StudentList title="Active" students={active} />
          {inactive.length > 0 && <StudentList title="Inactive" students={inactive} muted />}
        </div>
      )}
    </div>
  )
}

function StudentList({
  title,
  students,
  muted = false,
}: {
  title: string
  students: Array<{
    id: string
    full_name: string
    student_number: string | null
    is_active: boolean
    classes: { name: string } | null
  }>
  muted?: boolean
}) {
  if (!students.length) return null

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
        {title} · {students.length}
      </h2>
      <div className="card divide-y divide-surface-border">
        {students.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div
              className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold
                ${s.is_active ? 'bg-brand/10 text-brand-dark' : 'bg-slate-100 text-ink-muted'}`}
            >
              {s.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${muted ? 'text-ink-muted line-through' : 'text-ink'}`}>
                {s.full_name}
              </p>
              <p className="text-xs text-ink-subtle">
                {s.classes?.name ?? 'No class'}
                {s.student_number ? ` · #${s.student_number}` : ''}
              </p>
            </div>

            <Link
              href={`/admin/students/${s.id}`}
              className="text-xs text-brand hover:underline px-2 py-1"
            >
              Edit
            </Link>

            <form
              action={async () => {
                'use server'
                await setStudentActiveAction(s.id, !s.is_active)
              }}
            >
              <button
                type="submit"
                className="btn-ghost p-1.5"
                title={s.is_active ? 'Deactivate' : 'Reactivate'}
              >
                {s.is_active ? (
                  <UserX className="w-4 h-4 text-red-400" />
                ) : (
                  <UserCheck className="w-4 h-4 text-brand" />
                )}
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  )
}
