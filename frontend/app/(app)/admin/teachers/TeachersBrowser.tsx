'use client'

import { useMemo, useState } from 'react'
import { Mail, ShieldCheck, Search as SearchIcon } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import DeactivateTeacherButton from './DeactivateTeacherButton'

interface Teacher {
  id: string
  full_name: string
  email: string
  role: string
  is_active: boolean
}

interface Props {
  rows: Teacher[]
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
    return rows.filter((t) => normalize(t.full_name).includes(q) || normalize(t.email).includes(q))
  }, [rows, query])

  const active = filtered.filter((t) => t.is_active)
  const inactive = filtered.filter((t) => !t.is_active)

  return (
    <div className="space-y-5">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search by name or email…"
        aria-label="Search teachers"
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
          <SearchIcon className="w-7 h-7 mx-auto text-brand-accent/60" />
          <p className="text-sm font-medium text-ink mt-2">No staff match &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-ink-muted mt-1">Try a different name or email.</p>
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
  rows: Teacher[]
  muted?: boolean
}) {
  if (!rows.length) return null
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
        {title} · {rows.length}
      </h3>
      <div className="card divide-y divide-surface-border overflow-hidden">
        {rows.map((t) => {
          const isAdmin = t.role === 'ADMIN'
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 sm:px-5 py-4 hover:bg-surface-muted/60 transition-colors">
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
                </div>
                <p className="text-xs text-ink-subtle flex items-center gap-1.5 mt-0.5 truncate">
                  <Mail className="w-3 h-3 flex-shrink-0" /> {t.email}
                </p>
              </div>
              <DeactivateTeacherButton teacherId={t.id} isActive={t.is_active} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
