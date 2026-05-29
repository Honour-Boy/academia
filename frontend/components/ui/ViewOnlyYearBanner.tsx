import Link from 'next/link'
import { Eye, ArrowRight } from 'lucide-react'

interface Props {
  currentYear: string
  /** The most recent year on file — admin can switch back to write again. */
  latestYear: string
}

/**
 * Sticky banner shown app-wide whenever the school's active year is a past
 * year (the admin switched back to browse history). Tells the user nothing
 * can be edited until they switch to the latest year.
 */
export default function ViewOnlyYearBanner({ currentYear, latestYear }: Props) {
  return (
    <div className="bg-brand-secondary text-brand-accent-dark border-b border-brand-secondary/60">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-3 text-xs sm:text-sm">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <p className="flex-1 min-w-0">
          <span className="font-semibold">View-only:</span>{' '}
          browsing past year <span className="font-mono">{currentYear}</span>. Nothing can be created, edited, or graded until you switch back to <span className="font-mono">{latestYear}</span>.
        </p>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 font-medium hover:underline whitespace-nowrap"
        >
          Switch to {latestYear} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}
