import { Skeleton, SkeletonStatCard } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-7">
      <div className="rounded-2xl bg-gradient-to-br from-brand-accent via-brand-accent-dark to-brand-primary-dark p-5 sm:p-7">
        <Skeleton className="w-32 h-3 bg-white/20" />
        <Skeleton className="w-48 h-8 mt-3 bg-white/25" />
        <Skeleton className="w-72 h-3 mt-3 bg-white/15" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div>
        <Skeleton className="w-32 h-3 mb-3" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5 flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="w-40 h-4" />
                <Skeleton className="w-24 h-3" />
                <Skeleton className="w-full h-1.5 rounded-full mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
