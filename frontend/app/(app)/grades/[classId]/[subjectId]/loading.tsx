import { Skeleton } from '@/components/ui/Skeleton'

export default function GradeEntryLoading() {
  return (
    <div className="max-w-5xl mx-auto w-full">
      <div className="sticky top-[68px] z-40 bg-white/90 backdrop-blur-md border-b border-surface-border">
        <span aria-hidden="true" className="block h-0.5 bg-gradient-to-r from-brand-accent via-brand-primary to-brand-secondary" />
        <div className="px-4 sm:px-6 py-4 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="w-40 h-5" />
            <Skeleton className="w-32 h-3" />
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-3 flex items-center gap-3">
          <Skeleton className="flex-1 h-1.5 rounded-full" />
          <Skeleton className="w-10 h-3" />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-border bg-surface-muted/40">
              <Skeleton className="w-6 h-3" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="w-40 h-4" />
                <Skeleton className="w-20 h-3" />
              </div>
              <Skeleton className="w-10 h-7 rounded" />
            </div>
            <div className="px-5 py-3 grid grid-cols-2 sm:flex sm:items-end gap-3">
              <div className="flex-1 space-y-1.5"><Skeleton className="w-12 h-3" /><Skeleton className="w-full h-11 rounded-lg" /></div>
              <div className="flex-1 space-y-1.5"><Skeleton className="w-12 h-3" /><Skeleton className="w-full h-11 rounded-lg" /></div>
              <div className="flex-1 space-y-1.5"><Skeleton className="w-12 h-3" /><Skeleton className="w-full h-11 rounded-lg" /></div>
              <div className="col-span-2 sm:w-24 space-y-1.5"><Skeleton className="w-12 h-3" /><Skeleton className="w-full h-11 rounded-lg" /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
