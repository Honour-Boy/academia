import Link from 'next/link'
import { ChevronRight, Users } from 'lucide-react'

interface Props {
  classId: string
  subjectId: string
  className: string
  subjectName: string
  teacherName?: string
  totalStudents: number
  gradedStudents: number
  term: string
  academicYear: string
}

export default function ClassSubjectCard({
  classId, subjectId, className, subjectName,
  teacherName, totalStudents, gradedStudents,
}: Props) {
  const pct = totalStudents > 0 ? (gradedStudents / totalStudents) * 100 : 0
  const isComplete = gradedStudents >= totalStudents && totalStudents > 0

  return (
    <Link
      href={`/grades/${classId}/${subjectId}`}
      className="card p-4 flex items-center gap-4 cursor-pointer hover:border-brand/50 hover:shadow-md transition-all duration-150 active:scale-[0.98]"
    >
      {/* Colour dot */}
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
          ${isComplete ? 'bg-brand/10' : 'bg-slate-100'}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
          className={`w-5 h-5 ${isComplete ? 'text-brand' : 'text-ink-muted'}`}>
          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="font-semibold text-ink text-sm truncate">{subjectName}</p>
          <span className="text-xs text-ink-subtle bg-slate-100 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
            {className}
          </span>
        </div>

        {teacherName && (
          <p className="text-xs text-ink-muted mt-0.5">{teacherName}</p>
        )}

        {/* Progress */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-brand' : 'bg-blue-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="flex items-center gap-1 text-xs text-ink-muted flex-shrink-0">
            <Users className="w-3 h-3" />
            {gradedStudents}/{totalStudents}
          </span>
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-ink-subtle flex-shrink-0" />
    </Link>
  )
}
