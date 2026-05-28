import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

interface Props {
  rows?: number
  /** Show 3-up stat cards under the header (use on /admin overview). */
  withStats?: boolean
}

export default function AdminPageSkeleton({ rows = 5, withStats = false }: Props) {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="space-y-2">
        <Skeleton className="w-48 h-7" />
        <Skeleton className="w-72 h-3" />
      </div>

      {withStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-5 flex flex-col gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="w-20 h-7" />
              <Skeleton className="w-24 h-3" />
            </div>
          ))}
        </div>
      )}

      <div className="card divide-y divide-surface-border overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
