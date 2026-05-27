import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Plus, UserCheck, UserX } from 'lucide-react'
import DeactivateTeacherButton from './DeactivateTeacherButton'

export const metadata: Metadata = { title: 'Teachers' }

export default async function TeachersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_active, created_at')
    .eq('role', 'TEACHER')
    .order('full_name')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="btn-ghost p-2 -ml-2"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="flex-1 font-semibold text-ink text-xl">Teachers</h1>
        <Link href="/admin/teachers/new" className="btn-primary gap-1.5">
          <Plus className="w-4 h-4" /> Add teacher
        </Link>
      </div>

      {!teachers?.length ? (
        <div className="card p-10 text-center">
          <p className="text-ink-muted">No teachers yet. Add one above.</p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-border">
          {teachers.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-4">
              <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold
                ${t.is_active ? 'bg-brand/10 text-brand-dark' : 'bg-slate-100 text-ink-muted'}`}>
                {t.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${t.is_active ? 'text-ink' : 'text-ink-muted line-through'}`}>
                  {t.full_name}
                </p>
                <p className="text-xs text-ink-subtle truncate">{t.email}</p>
              </div>
              {t.is_active
                ? <UserCheck className="w-4 h-4 text-brand flex-shrink-0" />
                : <UserX    className="w-4 h-4 text-red-400 flex-shrink-0" />}
              <DeactivateTeacherButton teacherId={t.id} isActive={t.is_active} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
