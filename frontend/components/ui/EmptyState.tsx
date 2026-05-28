import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  primaryAction?: { label: string; href?: string; onClick?: () => void }
  className?: string
}

/**
 * Branded empty state — gold-tinted icon halo, gentle fade-in.
 * Use whenever a list/grid would otherwise show nothing.
 */
export default function EmptyState({ icon: Icon, title, description, primaryAction, className }: EmptyStateProps) {
  return (
    <div
      className={
        'card p-10 sm:p-12 flex flex-col items-center text-center gap-4 animate-fade-in-up ' +
        (className ?? '')
      }
    >
      <div className="relative">
        <span aria-hidden="true" className="absolute inset-0 -m-3 rounded-full bg-brand-secondary/15 blur-2xl" />
        <span className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-secondary-light to-brand-primary-light ring-1 ring-brand-secondary/40">
          <Icon className="w-7 h-7 text-brand-primary-dark" strokeWidth={2} />
        </span>
      </div>

      <div className="space-y-1">
        <p className="font-semibold text-ink text-base">{title}</p>
        {description && <p className="text-ink-muted text-sm max-w-sm">{description}</p>}
      </div>

      {primaryAction && (
        primaryAction.href ? (
          <Link href={primaryAction.href} className="btn-brand mt-1">{primaryAction.label}</Link>
        ) : (
          <button onClick={primaryAction.onClick} className="btn-brand mt-1">{primaryAction.label}</button>
        )
      )}
    </div>
  )
}
