'use client'

import { useTransition, useState } from 'react'
import { updateStudentAction } from '../actions'
import type { Class, Subject } from '@/types'

interface Props {
  studentId: string
  defaultName: string
  defaultStudentNumber: string
  defaultClassId: string
  classes: (Class & { classTeacherName: string | null })[]
  subjects: Subject[]
  enrolledSubjectIds: string[]
}

export default function EditStudentForm({
  studentId,
  defaultName,
  defaultStudentNumber,
  defaultClassId,
  classes,
  subjects,
  enrolledSubjectIds,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedClassId, setSelectedClassId] = useState(defaultClassId)

  const enrolled = new Set(enrolledSubjectIds)
  const selectedClass = classes.find((c) => c.id === selectedClassId)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateStudentAction(studentId, fd)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="full_name" className="label">Full Name <span className="text-red-500">*</span></label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          defaultValue={defaultName}
          className="input mt-1"
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="student_number" className="label">Student Number <span className="text-ink-subtle">(optional)</span></label>
        <input
          id="student_number"
          name="student_number"
          type="text"
          defaultValue={defaultStudentNumber}
          className="input mt-1"
        />
      </div>

      <div>
        <label htmlFor="class_id" className="label">Assigned Class <span className="text-red-500">*</span></label>
        <select
          id="class_id"
          name="class_id"
          required
          className="input mt-1"
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
        >
          <option value="">— Select a class —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {selectedClass && (
          <p className="mt-1.5 text-xs text-ink-muted">
            Class Teacher:{' '}
            <span className="font-medium text-ink">
              {selectedClass.classTeacherName ?? 'Not yet assigned'}
            </span>
          </p>
        )}
      </div>

      <div>
        <p className="label mb-2">Subjects Offered <span className="text-red-500">*</span></p>
        <div className="card p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
          {subjects.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
              <input
                type="checkbox"
                name="subject_ids"
                value={s.id}
                defaultChecked={enrolled.has(s.id)}
                className="w-4 h-4 accent-brand rounded"
              />
              <span className="text-ink">{s.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={pending} className="btn-primary flex-1">
          {pending ? 'Saving…' : 'Save Changes'}
        </button>
        <a href="/admin/students" className="btn-secondary flex-1 text-center">
          Cancel
        </a>
      </div>
    </form>
  )
}
