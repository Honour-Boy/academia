'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Eye, GraduationCap, ChevronRight, Search as SearchIcon } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import ExpandCollapseToggle from '@/components/ui/ExpandCollapseToggle'
import DownloadReportButton from './DownloadReportButton'
import DownloadClassZipButton from './DownloadClassZipButton'

export interface ReportRow {
  id: string
  full_name: string
  studentNumber: string | null
  className: string
}

interface Props {
  rows: ReportRow[]
  term: string
  year: string
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

export default function ReportsBrowser({ rows, term, year }: Props) {
  const [query, setQuery] = useState('')
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    // Default: all class sections open, matching the previous server-rendered
    // behaviour. Admin can collapse from the toggle.
    const init: Record<string, boolean> = {}
    for (const r of rows) init[r.className] = true
    return init
  })

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return rows
    return rows.filter((s) =>
      normalize(s.full_name).includes(q)
      || (s.studentNumber && normalize(s.studentNumber).includes(q))
      || normalize(s.className).includes(q),
    )
  }, [rows, query])

  // Re-group filtered rows by class
  const byClass = useMemo(() => {
    const map = new Map<string, ReportRow[]>()
    for (const r of filtered) {
      const list = map.get(r.className) ?? []
      list.push(r)
      map.set(r.className, list)
    }
    return Array.from(map.entries())
      .map(([className, students]) => ({ className, students }))
      .sort((a, b) => a.className.localeCompare(b.className))
  }, [filtered])

  const classKeys = byClass.map((g) => g.className)
  const allOpen = classKeys.length > 0 && classKeys.every((k) => openMap[k])
  const anyOpen = classKeys.some((k) => openMap[k])

  function expandAll() {
    const next: Record<string, boolean> = { ...openMap }
    for (const k of classKeys) next[k] = true
    setOpenMap(next)
  }

  function collapseAll() {
    const next: Record<string, boolean> = { ...openMap }
    for (const k of classKeys) next[k] = false
    setOpenMap(next)
  }

  function toggle(key: string) {
    setOpenMap((m) => ({ ...m, [key]: !m[key] }))
  }

  if (rows.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, student #, or class…"
            aria-label="Search students for reports"
          />
        </div>
        <ExpandCollapseToggle
          allOpen={allOpen}
          anyOpen={anyOpen}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          noun="classes"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
          <SearchIcon className="w-7 h-7 mx-auto text-brand-accent/60" />
          <p className="text-sm font-medium text-ink mt-2">No students match &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-ink-muted mt-1">Try a different name, student number, or class.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {byClass.map(({ className, students }) => {
            const open = !!openMap[className]
            return (
              <section key={className}>
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => toggle(className)}
                    aria-expanded={open}
                    className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle hover:text-ink cursor-pointer"
                  >
                    <ChevronRight className={'w-3.5 h-3.5 transition-transform ' + (open ? 'rotate-90' : '')} />
                    <GraduationCap className="w-3.5 h-3.5" /> {className}
                    <span className="text-ink-subtle/70">· {students.length}</span>
                  </button>
                  <DownloadClassZipButton
                    className={className}
                    studentIds={students.map((s) => s.id)}
                    term={term}
                    year={year}
                  />
                </div>
                {open && (
                  <div className="card divide-y divide-surface-border overflow-hidden">
                    {students.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-surface-muted/60 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{s.full_name}</p>
                          {s.studentNumber && (
                            <p className="text-xs text-ink-subtle font-mono mt-0.5">#{s.studentNumber}</p>
                          )}
                        </div>
                        <Link
                          href={`/reports/${s.id}?term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`}
                          aria-label={`Preview ${s.full_name}'s report`}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <DownloadReportButton
                          studentId={s.id}
                          studentName={s.full_name}
                          term={term}
                          year={year}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
