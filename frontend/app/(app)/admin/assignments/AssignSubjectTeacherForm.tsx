'use client'

import { useTransition, useState } from 'react'
import { toast } from 'sonner'
import { Combobox } from '@/components/ui/Combobox'
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
  const [teacherId, setTeacherId] = useState('')
  const [classId, setClassId] = useState('')
  const [subjectId, setSubjectId] = useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!teacherId || !classId || !subjectId) {
      setError('Pick a teacher, class, and subject')
      return
    }
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await assignSubjectTeacherAction(fd)
      if (r?.error) {
        setError(r.error)
      } else {
        toast.success('Subject teacher assigned')
        setTeacherId('')
        setClassId('')
        setSubjectId('')
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
        <Combobox
          id="teacher_id"
          name="teacher_id"
          className="mt-1"
          value={teacherId}
          onChange={setTeacherId}
          options={teachers.map((t) => ({ value: t.id, label: t.full_name }))}
          placeholder="— Select a teacher —"
          searchPlaceholder="Search teachers…"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="class_id" className="label">Class</label>
          <Combobox
            id="class_id"
            name="class_id"
            className="mt-1"
            value={classId}
            onChange={setClassId}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="— Class —"
            searchPlaceholder="Search classes…"
          />
        </div>

        <div>
          <label htmlFor="subject_id" className="label">Subject</label>
          <Combobox
            id="subject_id"
            name="subject_id"
            className="mt-1"
            value={subjectId}
            onChange={setSubjectId}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="— Subject —"
            searchPlaceholder="Search subjects…"
          />
        </div>
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? 'Assigning…' : 'Assign Subject Teacher'}
      </button>
    </form>
  )
}
