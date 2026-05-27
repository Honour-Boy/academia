'use client'

import { useTransition, useState } from 'react'
import { upsertRemarkAction } from '@/app/(app)/class-teacher/[classId]/actions'
import type { Student, StudentRemark, BehaviourRating } from '@/types'

interface Props {
  students: Student[]
  remarks: Record<string, StudentRemark> // studentId → remark
  classId: string
  term: string
  academicYear: string
}

const BEHAVIOUR_OPTIONS: BehaviourRating[] = [
  'Excellent', 'Very Good', 'Good', 'Fair', 'Poor',
]

export default function ClassTeacherSheet({
  students, remarks, classId, term, academicYear,
}: Props) {
  if (!students.length) {
    return (
      <div className="card p-10 text-center">
        <p className="text-ink-muted text-sm">No students in this class yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {students.map((student) => (
        <StudentRemarkRow
          key={student.id}
          student={student}
          remark={remarks[student.id] ?? null}
          classId={classId}
          term={term}
          academicYear={academicYear}
        />
      ))}
    </div>
  )
}

function StudentRemarkRow({
  student, remark, classId, term, academicYear,
}: {
  student: Student
  remark: StudentRemark | null
  classId: string
  term: string
  academicYear: string
}) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await upsertRemarkAction(fd)
      if (result?.error) {
        setError(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    })
  }

  return (
    <div className="card overflow-hidden">
      {/* Student header row */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-brand/10 text-brand-dark flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {student.full_name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{student.full_name}</p>
          {student.student_number && (
            <p className="text-xs text-ink-subtle">#{student.student_number}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {remark && (
            <span className="text-xs text-brand font-medium">Saved</span>
          )}
          <span className="text-ink-subtle text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expandable form */}
      {expanded && (
        <form onSubmit={handleSubmit} className="border-t border-surface-border px-4 py-4 space-y-4">
          <input type="hidden" name="student_id"    value={student.id} />
          <input type="hidden" name="class_id"      value={classId} />
          <input type="hidden" name="term"          value={term} />
          <input type="hidden" name="academic_year" value={academicYear} />

          {/* Attendance */}
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Attendance</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: 'times_present', label: 'Present', default: remark?.times_present ?? 0 },
                { name: 'times_absent',  label: 'Absent',  default: remark?.times_absent  ?? 0 },
                { name: 'times_late',    label: 'Late',    default: remark?.times_late    ?? 0 },
              ].map(({ name, label, default: def }) => (
                <div key={name}>
                  <label className="label text-xs mb-1">{label}</label>
                  <input
                    type="number"
                    name={name}
                    min={0}
                    defaultValue={def}
                    inputMode="numeric"
                    className="input text-center"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Behaviour */}
          <div>
            <label className="label text-xs mb-1">Behaviour</label>
            <select name="behaviour_rating" className="input" defaultValue={remark?.behaviour_rating ?? ''}>
              <option value="">— Select —</option>
              {BEHAVIOUR_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Remark */}
          <div>
            <label className="label text-xs mb-1">
              Class Teacher&apos;s Remark
              <span className="text-ink-subtle font-normal ml-1">(max 500 chars)</span>
            </label>
            <textarea
              name="teacher_remark"
              rows={3}
              maxLength={500}
              defaultValue={remark?.teacher_remark ?? ''}
              className="input resize-none"
              placeholder="e.g. Shows great improvement in class participation…"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? 'Saving…' : saved ? '✓ Saved' : 'Save Record'}
          </button>
        </form>
      )}
    </div>
  )
}
