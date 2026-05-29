'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Pencil, UserCheck, UserX, Search as SearchIcon,
  GraduationCap, ChevronRight, User,
} from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import ExpandCollapseToggle from '@/components/ui/ExpandCollapseToggle'
import { setStudentActiveAction } from './actions'

interface Student {
  id: string
  full_name: string
  student_number: string | null
  is_active: boolean
  classId: string | null
  className: string | null
  classTeacher: string | null
  subjects: string[]
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
  // Default every class group open — matches the prior `<details open>` UX.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const r of rows) if (r.classId) init[r.classId] = true
    return init
  })

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return rows
    return rows.filter((s) => {
      if (normalize(s.full_name).includes(q)) return true
      if (s.student_number && normalize(s.student_number).includes(q)) return true
      if (s.className && normalize(s.className).includes(q)) return true
      if (s.classTeacher && normalize(s.classTeacher).includes(q)) return true
      for (const subj of s.subjects) if (normalize(subj).includes(q)) return true
      return false
    })
  }, [rows, query])

  const active = filtered.filter((s) => s.is_active)
  const inactive = filtered.filter((s) => !s.is_active)

  // Group active students per class so the admin can scan a class roster +
  // grab the class ZIP in one click. Deactivated students stay in a single
  // flat section at the bottom (cross-class).
  const activeByClass = useMemo(() => {
    const map = new Map<string, { classId: string; className: string; students: Student[] }>()
    const noClassBucket: Student[] = []
    for (const s of active) {
      if (!s.classId) {
        noClassBucket.push(s)
        continue
      }
      const g = map.get(s.classId)
      if (g) g.students.push(s)
      else map.set(s.classId, {
        classId: s.classId,
        className: s.className ?? '—',
        students: [s],
      })
    }
    const groups = Array.from(map.values()).sort((a, b) => a.className.localeCompare(b.className))
    return { groups, noClassBucket }
  }, [active])

  const classKeys = activeByClass.groups.map((g) => g.classId)
  const isOpen = (classId: string) => !!query || !!openMap[classId]
  const allOpen = classKeys.length > 0 && classKeys.every(isOpen)
  const anyOpen = classKeys.some(isOpen)
  function expandAll() {
    setOpenMap((m) => {
      const n = { ...m }
      for (const k of classKeys) n[k] = true
      return n
    })
  }
  function collapseAll() {
    setOpenMap((m) => {
      const n = { ...m }
      for (const k of classKeys) n[k] = false
      return n
    })
  }
  function toggle(classId: string) {
    setOpenMap((m) => ({ ...m, [classId]: !isOpen(classId) }))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, ID, class, class teacher, or subject…"
            aria-label="Search students"
          />
        </div>
        {activeByClass.groups.length > 0 && (
          <ExpandCollapseToggle
            allOpen={allOpen}
            anyOpen={anyOpen}
            onExpandAll={expandAll}
            onCollapseAll={collapseAll}
            noun="classes"
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
          <SearchIcon className="w-7 h-7 mx-auto text-brand-accent/60" />
          <p className="text-sm font-medium text-ink mt-2">No students match &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-ink-muted mt-1">Try a different name, student number, or class.</p>
        </div>
      ) : (
        <>
          {activeByClass.groups.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                Active &middot; {active.length} across {activeByClass.groups.length} class{activeByClass.groups.length === 1 ? '' : 'es'}
              </h3>
              {activeByClass.groups.map((g) => (
                <ClassGroup
                  key={g.classId}
                  group={g}
                  open={isOpen(g.classId)}
                  onToggle={() => toggle(g.classId)}
                />
              ))}
            </section>
          )}

          {activeByClass.noClassBucket.length > 0 && (
            <StudentList title={`Active · no class assigned · ${activeByClass.noClassBucket.length}`} rows={activeByClass.noClassBucket} />
          )}

          {inactive.length > 0 && (
            <StudentList title={`Deactivated · ${inactive.length}`} rows={inactive} muted />
          )}
        </>
      )}
    </div>
  )
}

function ClassGroup({
  group, open, onToggle,
}: {
  group: { classId: string; className: string; students: Student[] }
  open: boolean
  onToggle: () => void
}) {
  const classTeacher = group.students.find((s) => s.classTeacher)?.classTeacher ?? null
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 bg-surface-muted border-b border-surface-border cursor-pointer text-left hover:bg-surface-muted/80 transition-colors"
      >
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-accent/10 text-brand-accent flex-shrink-0">
          <GraduationCap className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink font-mono">{group.className}</p>
          <p className="text-[11px] text-ink-muted">
            {group.students.length} student{group.students.length === 1 ? '' : 's'}
            {classTeacher && (
              <>
                <span className="text-ink-subtle"> · </span>
                <span className="inline-flex items-center gap-0.5">
                  <User className="w-3 h-3" /> {classTeacher}
                </span>
              </>
            )}
          </p>
        </div>
        <ChevronRight className={'w-4 h-4 text-ink-subtle transition-transform ' + (open ? 'rotate-90' : '')} />
      </button>
      {open && (
        <ul className="divide-y divide-surface-border">
          {group.students.map((s) => (
            <StudentItem key={s.id} student={s} />
          ))}
        </ul>
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
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">{title}</h3>
      <div className="card divide-y divide-surface-border overflow-hidden">
        {rows.map((s) => (
          <StudentItem key={s.id} student={s} muted={muted} />
        ))}
      </div>
    </section>
  )
}

function StudentItem({ student: s, muted = false }: { student: Student; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-surface-muted/60 transition-colors">
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
          {s.student_number ? `#${s.student_number}` : 'No student number'}
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
