'use client'

import { useTransition, useState } from 'react'
import { enrollStudentAction } from '../actions'
import { Combobox } from '@/components/ui/Combobox'
import { validateStudentNumber } from '@/lib/student-number-validation'
import type { Class, Subject } from '@/types'

interface Props {
  classes: (Class & { classTeacherName: string | null })[]
  subjects: Subject[]
  defaultTerm: string
  defaultYear: string
}

export default function EnrollStudentForm({ classes, subjects, defaultTerm, defaultYear }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [studentNumber, setStudentNumber] = useState('')

  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const yearCheck = validateStudentNumber(
    studentNumber || null,
    selectedClass?.level ?? null,
    defaultYear,
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await enrollStudentAction(fd)
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

      {/* Name */}
      <div>
        <label htmlFor="full_name" className="label">Full Name <span className="text-red-500">*</span></label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          placeholder="e.g. Adewale Okonkwo — add a middle name if another student or teacher shares the same name"
          className="input mt-1"
          autoComplete="off"
        />
        <p className="text-xs text-ink-subtle mt-1">
          Names must be unique across all staff and students (case-insensitive). If a duplicate exists, add a middle name (or initial) to differentiate.
        </p>
      </div>

      {/* Student Number (optional) */}
      <div>
        <label htmlFor="student_number" className="label">Student Number <span className="text-ink-subtle">(optional)</span></label>
        <input
          id="student_number"
          name="student_number"
          type="text"
          value={studentNumber}
          onChange={(e) => setStudentNumber(e.target.value)}
          placeholder="e.g. 2024/JSS/001"
          className="input mt-1"
        />
        {yearCheck.reason && (
          <p className="text-xs text-red-600 mt-1">{yearCheck.reason}</p>
        )}
        {selectedClass && yearCheck.expectedYear !== null && !yearCheck.reason && studentNumber && (
          <p className="text-xs text-emerald-700 mt-1">
            Year prefix matches {selectedClass.level} for {defaultYear}.
          </p>
        )}
      </div>

      {/* Class */}
      <div>
        <label htmlFor="class_id" className="label">Assigned Class <span className="text-red-500">*</span></label>
        <Combobox
          id="class_id"
          name="class_id"
          className="mt-1"
          value={selectedClassId}
          onChange={setSelectedClassId}
          options={classes.map((c) => ({
            value: c.id,
            label: c.name,
            secondary: c.classTeacherName ? `— ${c.classTeacherName}` : undefined,
          }))}
          placeholder="— Select a class —"
          searchPlaceholder="Search classes…"
        />

        {/* Auto-show class teacher */}
        {selectedClass && (
          <p className="mt-1.5 text-xs text-ink-muted">
            Class Teacher:{' '}
            <span className="font-medium text-ink">
              {selectedClass.classTeacherName ?? 'Not yet assigned'}
            </span>
          </p>
        )}
      </div>

      {/* Subjects — multiselect checkboxes */}
      <div>
        <p className="label mb-2">
          Subjects Offered <span className="text-red-500">*</span>
        </p>
        <div className="card p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
          {subjects.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
              <input
                type="checkbox"
                name="subject_ids"
                value={s.id}
                className="w-4 h-4 accent-brand rounded"
              />
              <span className="text-ink">{s.name}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-subtle mt-1">
          Only selected subjects will appear on this student&apos;s report sheet.
        </p>
      </div>

      {/* Hidden term/year */}
      <input type="hidden" name="term" value={defaultTerm} />
      <input type="hidden" name="academic_year" value={defaultYear} />

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={pending} className="btn-primary flex-1">
          {pending ? 'Enrolling…' : 'Enroll Student'}
        </button>
        <a href="/admin/students" className="btn-secondary flex-1 text-center">
          Cancel
        </a>
      </div>
    </form>
  )
}
