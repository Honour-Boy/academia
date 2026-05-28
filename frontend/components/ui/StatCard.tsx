import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tone = 'crimson' | 'gold' | 'navy' | 'emerald' | 'sky'

interface StatCardProps {
  label: string
  value: number | string
  icon: LucideIcon
  tone?: Tone
  href?: string
  hint?: string
}

const TONE: Record<Tone, { iconBg: string; iconFg: string; ring: string; valueFg?: string }> = {
  crimson: { iconBg: 'bg-brand-primary-light', iconFg: 'text-brand-primary-dark', ring: 'hover:ring-brand-primary/30' },
  gold:    { iconBg: 'bg-brand-secondary-light', iconFg: 'text-brand-secondary-dark', ring: 'hover:ring-brand-secondary/40' },
  navy:    { iconBg: 'bg-brand-accent/10', iconFg: 'text-brand-accent', ring: 'hover:ring-brand-accent/30' },
  emerald: { iconBg: 'bg-emerald-50', iconFg: 'text-emerald-600', ring: 'hover:ring-emerald-500/30' },
  sky:     { iconBg: 'bg-sky-50', iconFg: 'text-sky-600', ring: 'hover:ring-sky-500/30' },
}

export default function StatCard({ label, value, icon: Icon, tone = 'crimson', href, hint }: StatCardProps) {
  const t = TONE[tone]

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className={cn('inline-flex items-center justify-center w-11 h-11 rounded-xl', t.iconBg, t.iconFg)}>
          <Icon className="w-5 h-5" strokeWidth={2.2} />
        </div>
        {href && (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowUpRight className="w-4 h-4 text-ink-subtle" />
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className={cn('text-3xl font-bold font-mono leading-none', t.valueFg ?? 'text-ink')}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-ink-muted text-sm mt-1.5 font-medium">{label}</p>
        {hint && <p className="text-ink-subtle text-xs mt-1">{hint}</p>}
      </div>
    </>
  )

  const baseClass = cn(
    'group card p-5 transition-all duration-200',
    'ring-1 ring-transparent',
    href && cn('cursor-pointer hover:shadow-lg active:scale-[0.99]', t.ring),
  )

  return href ? (
    <Link href={href} className={baseClass}>{inner}</Link>
  ) : (
    <div className={baseClass}>{inner}</div>
  )
}
