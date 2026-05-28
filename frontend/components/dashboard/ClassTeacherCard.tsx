import Link from 'next/link'
import { Users, ChevronRight } from 'lucide-react'

interface Props {
  classId: string
  className: string
  term: string
  academicYear: string
}

export default function ClassTeacherCard({ classId, className, term, academicYear }: Props) {
  return (
    <Link
      href={`/class-teacher/${classId}?term=${encodeURIComponent(term)}&year=${encodeURIComponent(academicYear)}`}
      className="card p-4 sm:p-5 flex items-center gap-4 cursor-pointer hover:shadow-lg hover:ring-1 hover:ring-brand-accent/30 active:scale-[0.99] transition-all duration-200 group"
    >
      <span
        aria-hidden="true"
        className="flex-shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-2xl text-white shadow-sm ring-1 ring-white/40 bg-gradient-to-br from-brand-accent to-brand-accent-dark"
      >
        <Users className="w-5 h-5" />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-ink text-sm sm:text-base truncate">{className}</p>
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary-dark bg-brand-secondary-light px-1.5 py-0.5 rounded">
            Class Teacher
          </span>
        </div>
        <p className="text-xs text-ink-muted mt-1">Attendance · Behaviour · Remarks</p>
      </div>

      <ChevronRight className="w-4 h-4 text-ink-subtle group-hover:text-brand-accent transition-colors flex-shrink-0" />
    </Link>
  )
}
