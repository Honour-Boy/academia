'use client'

import { useMemo, useState } from 'react'
import {
  Network, BookOpen, GraduationCap, User, ChevronRight,
  Search as SearchIcon,
} from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import ExpandCollapseToggle from '@/components/ui/ExpandCollapseToggle'
import EmptyState from '@/components/ui/EmptyState'
import RemoveAssignmentButton from './RemoveAssignmentButton'

export interface AssignmentRow {
  id: string
  teacherId: string
  teacherName: string
  className: string
  subjectName: string
}

interface Props {
  rows: AssignmentRow[]
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

export default function AssignmentsBrowser({ rows }: Props) {
  const [query, setQuery] = useState('')
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return rows
    return rows.filter((r) =>
      normalize(r.teacherName).includes(q)
      || normalize(r.subjectName).includes(q)
      || normalize(r.className).includes(q),
    )
  }, [rows, query])

  const groupedByTeacher = useMemo(() => {
    const map = new Map<string, { teacherId: string; teacherName: string; items: AssignmentRow[] }>()
    for (const r of filtered) {
      const g = map.get(r.teacherId)
      if (g) g.items.push(r)
      else map.set(r.teacherId, { teacherId: r.teacherId, teacherName: r.teacherName, items: [r] })
    }
    return Array.from(map.values()).sort((a, b) => a.teacherName.localeCompare(b.teacherName))
  }, [filtered])

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="Nothing assigned yet"
        description="Use the matrix above to bulk-assign a teacher to multiple subject × class cells, then come back here for the per-row view."
      />
    )
  }

  // Controlled open-state: search auto-opens every visible group, manual
  // toggle persists otherwise. allOpen/anyOpen drive the global toggle.
  const teacherKeys = groupedByTeacher.map((g) => g.teacherId)
  const isOpen = (teacherId: string) => !!query || !!openMap[teacherId]
  const allOpen = teacherKeys.length > 0 && teacherKeys.every(isOpen)
  const anyOpen = teacherKeys.some(isOpen)
  function expandAll() {
    setOpenMap((m) => {
      const n = { ...m }
      for (const k of teacherKeys) n[k] = true
      return n
    })
  }
  function collapseAll() {
    setOpenMap((m) => {
      const n = { ...m }
      for (const k of teacherKeys) n[k] = false
      return n
    })
  }
  function toggle(teacherId: string) {
    setOpenMap((m) => ({ ...m, [teacherId]: !isOpen(teacherId) }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by teacher, subject, or class…"
            aria-label="Search assignments"
          />
        </div>
        <ExpandCollapseToggle
          allOpen={allOpen}
          anyOpen={anyOpen}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          noun="teachers"
        />
      </div>

      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          {groupedByTeacher.length} teacher{groupedByTeacher.length === 1 ? '' : 's'} · {filtered.length} assignment{filtered.length === 1 ? '' : 's'}
          {query && rows.length !== filtered.length && (
            <span className="text-ink-subtle"> · filtered from {rows.length}</span>
          )}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
          <SearchIcon className="w-7 h-7 mx-auto text-brand-accent/60" />
          <p className="text-sm font-medium text-ink mt-2">No assignments match &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-ink-muted mt-1">Try a different teacher, subject, or class name.</p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-border overflow-hidden">
          {groupedByTeacher.map((g) => {
            const open = isOpen(g.teacherId)
            return (
              <div key={g.teacherId}>
                <button
                  type="button"
                  onClick={() => toggle(g.teacherId)}
                  aria-expanded={open}
                  className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-surface-muted/60 transition-colors cursor-pointer text-left"
                >
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-brand-accent/10 text-brand-accent flex-shrink-0">
                    <User className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{g.teacherName}</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {g.items.length} assignment{g.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ChevronRight className={'w-4 h-4 text-ink-subtle transition-transform ' + (open ? 'rotate-90' : '')} />
                </button>
                {open && (
                  <ul className="divide-y divide-surface-border bg-surface-muted/30">
                    {g.items.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 pl-16 pr-4 sm:pr-5 py-2.5 hover:bg-surface-muted/60 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-ink-muted flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-ink">
                              <BookOpen className="w-3 h-3" />{r.subjectName}
                            </span>
                            <span className="text-ink-subtle">·</span>
                            <span className="inline-flex items-center gap-1">
                              <GraduationCap className="w-3 h-3" />{r.className}
                            </span>
                          </p>
                        </div>
                        <RemoveAssignmentButton assignmentId={r.id} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
