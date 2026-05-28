'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, ChevronRight, User, BookOpen, Search, X } from 'lucide-react'

export interface AuditEntry {
  id: string
  who: string
  action: 'INSERT' | 'UPDATE'
  oldScore: number | null
  newScore: number | null
  changedAt: string
  studentId: string | null
  student: string
  subject: string
}

interface Props {
  entries: AuditEntry[]
}

interface StudentGroup {
  key: string
  student: string
  items: AuditEntry[]
  latest: string
  inserts: number
  updates: number
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

export default function AuditByStudent({ entries }: Props) {
  const [query, setQuery] = useState('')

  const filteredEntries = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return entries
    return entries.filter((e) => normalize(e.student).includes(q) || normalize(e.subject).includes(q))
  }, [entries, query])

  const groups = useMemo<StudentGroup[]>(() => {
    const map = new Map<string, StudentGroup>()
    for (const e of filteredEntries) {
      // Use studentId when present so two students with identical names don't collide;
      // fall back to the displayed name for unknown rows.
      const key = e.studentId ?? `name:${e.student}`
      const g = map.get(key)
      if (g) {
        g.items.push(e)
        if (e.changedAt > g.latest) g.latest = e.changedAt
        if (e.action === 'INSERT') g.inserts += 1
        else g.updates += 1
      } else {
        map.set(key, {
          key,
          student: e.student,
          items: [e],
          latest: e.changedAt,
          inserts: e.action === 'INSERT' ? 1 : 0,
          updates: e.action === 'UPDATE' ? 1 : 0,
        })
      }
    }
    // Most recently active student first.
    return Array.from(map.values()).sort((a, b) => (a.latest > b.latest ? -1 : 1))
  }, [filteredEntries])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by student or subject…"
          aria-label="Filter audit log"
          className="input-brand pl-10 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-md text-ink-subtle hover:text-ink hover:bg-surface-muted cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
          <Search className="w-7 h-7 mx-auto text-brand-accent/60" />
          <p className="text-sm font-medium text-ink mt-2">No changes match &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-ink-muted mt-1">Try a different student or subject name.</p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-border overflow-hidden">
          {groups.map((g) => (
        <details key={g.key} className="group">
          <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-surface-muted/60 transition-colors">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold text-white flex-shrink-0 ring-1 ring-white/40 shadow-sm bg-gradient-to-br from-brand-secondary to-brand-primary">
              {initials(g.student)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{g.student}</p>
              <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{g.items.length} change{g.items.length === 1 ? '' : 's'}</span>
                {g.inserts > 0 && (
                  <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    {g.inserts} insert{g.inserts === 1 ? '' : 's'}
                  </span>
                )}
                {g.updates > 0 && (
                  <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-brand-secondary-light text-brand-secondary-dark ring-1 ring-brand-secondary/30">
                    {g.updates} update{g.updates === 1 ? '' : 's'}
                  </span>
                )}
                <span className="text-ink-subtle">·</span>
                <span className="text-ink-subtle">latest {new Date(g.latest).toLocaleString()}</span>
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-subtle transition-transform group-open:rotate-90" />
          </summary>

          <ul className="divide-y divide-surface-border bg-surface-muted/30">
            {g.items.map((e) => (
              <li key={e.id} className="pl-16 pr-4 sm:pr-5 py-2.5">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-xs text-ink-muted truncate inline-flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    <span className="text-ink font-medium">{e.subject}</span>
                  </p>
                  <span
                    className={
                      'inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ' +
                      (e.action === 'INSERT'
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-brand-secondary-light text-brand-secondary-dark ring-1 ring-brand-secondary/30')
                    }
                  >
                    {e.action}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm font-mono text-ink">
                  <span className="text-ink-subtle">{e.oldScore ?? '—'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-ink-subtle" />
                  <span className="font-bold">{e.newScore ?? '—'}</span>
                </div>
                <p className="text-xs text-ink-subtle mt-1 inline-flex items-center gap-1">
                  <User className="w-3 h-3" /> {e.who} · {new Date(e.changedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </details>
          ))}
        </div>
      )}
    </div>
  )
}
