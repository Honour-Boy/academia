import { Skeleton } from '@/components/ui/Skeleton'

export default function ClassTeacherLoading() {
  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="sticky top-[68px] z-40 bg-white/90 backdrop-blur-md border-b border-surface-border">
        <span aria-hidden="true" className="block h-0.5 bg-gradient-to-r from-brand-accent via-brand-primary to-brand-secondary" />
        <div className="px-4 sm:px-6 py-4 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="w-32 h-5" />
            <Skeleton className="w-48 h-3" />
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-3">
          <Skeleton className="w-full h-1.5 rounded-full" />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="w-40 h-4" />
              <Skeleton className="w-24 h-3" />
            </div>
            <Skeleton className="w-16 h-8 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
