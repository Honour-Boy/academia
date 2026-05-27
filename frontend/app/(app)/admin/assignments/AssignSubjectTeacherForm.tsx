'use client'

import { useTransition, useState } from 'react'
import { toast } from 'sonner'
import { assignSubjectTeacherAction } from './actions'

interface Props {
  teachers: { id: string; full_name: string }[]
  classes: { id: string; name: string }[]
  subjects: { id: string; name: string }[]
  term: string
  academicYear: string
}

export default function AssignSubjectTeacherForm({ teachers, classes, subjects, term, academicYear }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const fd = new FormData(form)
    startTransition(async () => {
      const r = await assignSubjectTeacherAction(fd)
      if (r?.error) {
        setError(r.error)
      } else {
        toast.success('Subject teacher assigned')
        form.reset()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <input type="hidden" name="term" value={term} />
      <input type="hidden" name="academic_year" value={academicYear} />

      <div>
        <label htmlFor="teacher_id" className="label">Teacher</label>
        <select id="teacher_id" name="teacher_id" required defaultValue="" className="input mt-1">
          <option value="" disabled>— Select a teacher —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="class_id" className="label">Class</label>
          <select id="class_id" name="class_id" required defaultValue="" className="input mt-1">
            <option value="" disabled>— Class —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="subject_id" className="label">Subject</label>
          <select id="subject_id" name="subject_id" required defaultValue="" className="input mt-1">
            <option value="" disabled>— Subject —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? 'Assigning…' : 'Assign Subject Teacher'}
      </button>
    </form>
  )
}
