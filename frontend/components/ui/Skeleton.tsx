import { cn } from '@/lib/cn'

/**
 * Skeleton placeholder. Uses a soft shimmer that respects prefers-reduced-motion
 * (the keyframes degrade to a static muted block).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-gradient-to-r from-surface-border/60 via-surface-border/30 to-surface-border/60 rounded-md',
        'motion-reduce:animate-none',
        className,
      )}
    />
  )
}

export function SkeletonStatCard() {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <Skeleton className="w-10 h-10 rounded-xl" />
      <Skeleton className="w-20 h-8" />
      <Skeleton className="w-24 h-3" />
    </div>
  )
}

export function SkeletonRow({ cells = 4 }: { cells?: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border last:border-0">
      {Array.from({ length: cells }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4 flex-1', i === 0 && 'max-w-[30%]')} />
      ))}
    </div>
  )
}
