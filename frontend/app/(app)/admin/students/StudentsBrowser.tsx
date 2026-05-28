'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, UserCheck, UserX, Search as SearchIcon } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import { setStudentActiveAction } from './actions'

interface Student {
  id: string
  full_name: string
  student_number: string | null
  is_active: boolean
  className: string | null
}

interface Props {
  rows: Student[]
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

export default function StudentsBrowser({ rows }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return rows
    return rows.filter((s) =>
      normalize(s.full_name).includes(q)
      || (s.student_number && normalize(s.student_number).includes(q))
      || (s.className && normalize(s.className).includes(q)),
    )
  }, [rows, query])

  const active = filtered.filter((s) => s.is_active)
  const inactive = filtered.filter((s) => !s.is_active)

  return (
    <div className="space-y-5">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search by name, student #, or class…"
        aria-label="Search students"
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
          <SearchIcon className="w-7 h-7 mx-auto text-brand-accent/60" />
          <p className="text-sm font-medium text-ink mt-2">No students match &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-ink-muted mt-1">Try a different name, student number, or class.</p>
        </div>
      ) : (
        <>
          <StudentList title="Active" rows={active} />
          {inactive.length > 0 && <StudentList title="Deactivated" rows={inactive} muted />}
        </>
      )}
    </div>
  )
}

function StudentList({
  title,
  rows,
  muted = false,
}: {
  title: string
  rows: Student[]
  muted?: boolean
}) {
  if (!rows.length) return null

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
        {title} · {rows.length}
      </h3>
      <div className="card divide-y divide-surface-border overflow-hidden">
        {rows.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-surface-muted/60 transition-colors">
            <span
              className={
                'inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold text-white flex-shrink-0 ring-1 ring-white/40 shadow-sm ' +
                (muted ? 'bg-slate-300' : 'bg-gradient-to-br from-brand-secondary to-brand-primary')
              }
            >
              {initials(s.full_name)}
            </span>
            <div className="flex-1 min-w-0">
              <p className={'text-sm font-semibold truncate ' + (muted ? 'text-ink-muted line-through' : 'text-ink')}>
                {s.full_name}
              </p>
              <p className="text-xs text-ink-subtle truncate">
                {s.className ?? 'No class assigned'}
                {s.student_number ? ` · #${s.student_number}` : ''}
              </p>
            </div>

            <Link
              href={`/admin/students/${s.id}`}
              aria-label={`Edit ${s.full_name}`}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </Link>

            <ToggleActiveButton studentId={s.id} isActive={s.is_active} />
          </div>
        ))}
      </div>
    </section>
  )
}

function ToggleActiveButton({ studentId, isActive }: { studentId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => { void setStudentActiveAction(studentId, !isActive) })}
      aria-label={isActive ? 'Deactivate' : 'Reactivate'}
      title={isActive ? 'Deactivate' : 'Reactivate'}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors disabled:opacity-50"
    >
      {isActive ? (
        <UserX className="w-4 h-4" />
      ) : (
        <UserCheck className="w-4 h-4 text-emerald-600" />
      )}
    </button>
  )
}

