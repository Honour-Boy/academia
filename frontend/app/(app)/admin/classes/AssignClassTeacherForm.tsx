'use client'

import { useTransition, useState } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import { assignClassTeacherAction } from '../students/actions'

interface Props {
  classId: string
  currentTeacherId: string | null
  teachers: { id: string; full_name: string }[]
  term: string
  academicYear: string
}

export default function AssignClassTeacherForm({
  classId, currentTeacherId, teachers, term, academicYear,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [teacherId, setTeacherId] = useState(currentTeacherId ?? '')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await assignClassTeacherAction(fd)
      if (!r?.error) setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="class_id" value={classId} />
      <input type="hidden" name="term" value={term} />
      <input type="hidden" name="academic_year" value={academicYear} />

      <Combobox
        name="teacher_id"
        className="flex-1"
        value={teacherId}
        onChange={setTeacherId}
        options={teachers.map((t) => ({ value: t.id, label: t.full_name }))}
        placeholder="— Assign class teacher —"
        searchPlaceholder="Search teachers…"
        clearable
      />

      <button
        type="submit"
        disabled={pending}
        className="btn-primary btn-sm whitespace-nowrap"
      >
        {pending ? '…' : saved ? '✓ Saved' : 'Assign'}
      </button>
    </form>
  )
}
