import Link from 'next/link'
import { ChevronRight, BookOpen, Users, CheckCircle2 } from 'lucide-react'

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
  teacherName, totalStudents, gradedStudents, term, academicYear,
}: Props) {
  const pct = totalStudents > 0 ? Math.round((gradedStudents / totalStudents) * 100) : 0
  const isComplete = gradedStudents >= totalStudents && totalStudents > 0

  return (
    <Link
      href={`/grades/${classId}/${subjectId}?term=${encodeURIComponent(term)}&year=${encodeURIComponent(academicYear)}`}
      className="card p-4 sm:p-5 flex items-center gap-4 cursor-pointer hover:shadow-lg hover:ring-1 hover:ring-brand-primary/20 active:scale-[0.99] transition-all duration-200 group"
    >
      <span
        aria-hidden="true"
        className={
          'flex-shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-2xl text-white shadow-sm ring-1 ring-white/40 ' +
          (isComplete
            ? 'bg-gradient-to-br from-brand-secondary to-brand-secondary-dark'
            : 'bg-gradient-to-br from-brand-primary to-brand-primary-dark')
        }
      >
        {isComplete ? <CheckCircle2 className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-ink text-sm sm:text-base truncate">{subjectName}</p>
          <span className="text-[11px] font-mono font-medium text-brand-accent bg-brand-accent/10 px-1.5 py-0.5 rounded">
            {className}
          </span>
        </div>

        {teacherName && (
          <p className="text-xs text-ink-muted mt-0.5 truncate">{teacherName}</p>
        )}

        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="flex-1 h-1.5 bg-surface-border/60 rounded-full overflow-hidden">
            <div
              className={
                'h-full rounded-full transition-all duration-500 ease-out ' +
                (isComplete
                  ? 'bg-gradient-to-r from-brand-secondary to-brand-secondary-dark'
                  : 'bg-gradient-to-r from-brand-primary to-brand-primary-dark')
              }
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="flex items-center gap-1 text-xs text-ink-muted flex-shrink-0 font-medium">
            <Users className="w-3 h-3" />
            <span className="font-mono">{gradedStudents}/{totalStudents}</span>
          </span>
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-ink-subtle group-hover:text-brand-primary transition-colors flex-shrink-0" />
    </Link>
  )
}
