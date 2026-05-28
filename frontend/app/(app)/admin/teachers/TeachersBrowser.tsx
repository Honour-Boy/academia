'use client'

import { useMemo, useState } from 'react'
import {
  Mail, ShieldCheck, Search as SearchIcon,
  BookOpen, GraduationCap, ChevronDown, CircleDot,
} from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import { cn } from '@/lib/cn'
import DeactivateTeacherButton from './DeactivateTeacherButton'

export interface TeacherRow {
  id: string
  full_name: string
  email: string
  role: string
  is_active: boolean
  /** Subjects the teacher currently teaches in the active term, grouped by subject. */
  teaches: { subject: string; classes: string[] }[]
  /** Class they're class teacher of, if any (current term). */
  classTeacherOf: string | null
  /** Subjects they registered as teaching during sign-up. May be empty for admin-created accounts. */
  registeredSubjects: string[]
}

interface Props {
  rows: TeacherRow[]
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

export default function TeachersBrowser({ rows }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return rows
    return rows.filter((t) => {
      if (normalize(t.full_name).includes(q)) return true
      if (normalize(t.email).includes(q)) return true
      // Search across subjects too — admin can type "maths" to find every maths teacher.
      for (const t2 of t.teaches) if (normalize(t2.subject).includes(q)) return true
      for (const s of t.registeredSubjects) if (normalize(s).includes(q)) return true
      if (t.classTeacherOf && normalize(t.classTeacherOf).includes(q)) return true
      return false
    })
  }, [rows, query])

  const active = filtered.filter((t) => t.is_active)
  const inactive = filtered.filter((t) => !t.is_active)

  return (
    <div className="space-y-5">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search by name, email, subject, or class…"
        aria-label="Search teachers"
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
          <SearchIcon className="w-7 h-7 mx-auto text-brand-accent/60" />
          <p className="text-sm font-medium text-ink mt-2">No staff match &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-ink-muted mt-1">Try a different name, email, subject, or class.</p>
        </div>
      ) : (
        <>
          <TeacherList title="Active" rows={active} />
          {inactive.length > 0 && <TeacherList title="Deactivated" rows={inactive} muted />}
        </>
      )}
    </div>
  )
}

function TeacherList({
  title,
  rows,
  muted = false,
}: {
  title: string
  rows: TeacherRow[]
  muted?: boolean
}) {
  if (!rows.length) return null
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
        {title} · {rows.length}
      </h3>
      <div className="card divide-y divide-surface-border overflow-hidden">
        {rows.map((t) => (
          <TeacherRow key={t.id} row={t} muted={muted} />
        ))}
      </div>
    </section>
  )
}

function TeacherRow({ row: t, muted }: { row: TeacherRow; muted: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isAdmin = t.role === 'ADMIN'
  // Total taught subject-class pairs across the matrix (e.g. "Maths: 1A, 1B" = 2).
  const totalPairs = t.teaches.reduce((sum, x) => sum + x.classes.length, 0)
  const hasAnyDetail = totalPairs > 0 || t.classTeacherOf || t.registeredSubjects.length > 0

  return (
    <div className={cn('px-4 sm:px-5 py-4', muted && 'opacity-90')}>
      <div className="flex items-start gap-3">
        <span
          className={
            'inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold text-white flex-shrink-0 ring-1 ring-white/40 shadow-sm ' +
            (muted
              ? 'bg-slate-300'
              : isAdmin
                ? 'bg-gradient-to-br from-brand-primary to-brand-secondary'
                : 'bg-gradient-to-br from-brand-accent to-brand-accent-dark')
          }
        >
          {initials(t.full_name)}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={'text-sm font-semibold truncate ' + (muted ? 'text-ink-muted line-through' : 'text-ink')}>
              {t.full_name}
            </p>
            {isAdmin && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider bg-brand-primary-light text-brand-primary-dark px-1.5 py-0.5 rounded">
                <ShieldCheck className="w-3 h-3" /> Admin
              </span>
            )}
            {t.classTeacherOf && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-brand-accent text-white px-1.5 py-0.5 rounded">
                <GraduationCap className="w-3 h-3" /> Class teacher · {t.classTeacherOf}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-subtle flex items-center gap-1.5 mt-0.5 truncate">
            <Mail className="w-3 h-3 flex-shrink-0" /> {t.email}
          </p>

          {/* At-a-glance summary line: subjects this term */}
          {totalPairs > 0 ? (
            <p className="text-xs text-ink-muted mt-1.5 flex items-start gap-1.5">
              <BookOpen className="w-3 h-3 mt-0.5 flex-shrink-0 text-brand-primary" />
              <span className="min-w-0">
                Teaches{' '}
                <span className="font-medium text-ink">
                  {t.teaches.map((x) => x.subject).join(', ')}
                </span>{' '}
                <span className="text-ink-subtle">· {totalPairs} class assignment{totalPairs === 1 ? '' : 's'}</span>
              </span>
            </p>
          ) : t.registeredSubjects.length > 0 ? (
            <p className="text-xs text-ink-subtle mt-1.5 flex items-start gap-1.5">
              <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0 text-brand-secondary-dark" />
              <span className="min-w-0">
                Registered for{' '}
                <span className="font-medium text-ink">{t.registeredSubjects.join(', ')}</span>{' '}
                <span className="text-ink-subtle">· no class assignments this term</span>
              </span>
            </p>
          ) : !isAdmin && (
            <p className="text-xs text-ink-subtle mt-1.5 italic">No subjects registered. Use /admin/assignments to set.</p>
          )}

          {/* Expand for per-subject class breakdown */}
          {hasAnyDetail && totalPairs > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand-primary hover:text-brand-primary-dark cursor-pointer"
            >
              <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
              {expanded ? 'Hide breakdown' : 'Show per-subject classes'}
            </button>
          )}

          {expanded && (
            <ul className="mt-2 space-y-1">
              {t.teaches.map((row) => (
                <li
                  key={row.subject}
                  className="text-xs flex items-baseline gap-2 px-2 py-1 rounded bg-surface-muted/60"
                >
                  <span className="font-semibold text-ink min-w-0 truncate">{row.subject}</span>
                  <span className="text-ink-subtle">·</span>
                  <span className="font-mono text-brand-accent">
                    {row.classes.join(', ')}
                  </span>
                </li>
              ))}
              {t.registeredSubjects.length > t.teaches.length && (
                <li className="text-[11px] text-ink-subtle italic mt-1.5">
                  Registered subjects not currently assigned:{' '}
                  {t.registeredSubjects
                    .filter((s) => !t.teaches.some((x) => x.subject === s))
                    .join(', ') || '—'}
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="flex-shrink-0">
          <DeactivateTeacherButton teacherId={t.id} isActive={t.is_active} />
        </div>
      </div>
    </div>
  )
}
