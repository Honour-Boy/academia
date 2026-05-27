import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import NewTeacherForm from './NewTeacherForm'

export const metadata: Metadata = { title: 'Add Teacher' }

export default async function NewTeacherPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/teachers" className="btn-ghost p-2 -ml-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-semibold text-ink text-xl">Add Teacher</h1>
      </div>

      <div className="card p-6">
        <p className="text-sm text-ink-muted mb-5">
          Create a staff account. The teacher will log in with this email and password.
          No student accounts can be created here.
        </p>
        <NewTeacherForm />
      </div>
    </div>
  )
}
