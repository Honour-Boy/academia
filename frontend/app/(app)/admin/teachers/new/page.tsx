import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronLeft, UserPlus } from 'lucide-react'
import NewTeacherForm from './NewTeacherForm'

export const metadata: Metadata = { title: 'Admin · Add Teacher' }

export default async function NewTeacherPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link
        href="/admin/teachers"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-primary transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to teachers
      </Link>

      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-primary-light text-brand-primary-dark">
          <UserPlus className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Add teacher</h2>
          <p className="text-sm text-ink-muted mt-0.5">
            Create a staff account directly. Skips the approval queue.
          </p>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <p className="text-sm text-ink-muted mb-5">
          The teacher will sign in with this email and the password you set. Only staff are issued accounts —
          students never have logins.
        </p>
        <NewTeacherForm />
      </div>
    </div>
  )
}
