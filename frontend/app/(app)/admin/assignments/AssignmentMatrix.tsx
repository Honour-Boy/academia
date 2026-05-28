'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Network, Lock, Check, Pencil, Plus, Minus, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/Dialog'
import { bulkUpdateTeacherAssignmentsAction } from './actions'

interface Teacher { id: string; full_name: string }
interface ClassRow { id: string; name: string }
interface SubjectRow { id: string; name: string }
interface ExistingAssignment {
  id: string
  teacher_id: string
  class_id: string
  subject_id: string
}

interface Props {
  teachers: Teacher[]
  classes: ClassRow[]
  subjects: SubjectRow[]
  assignments: ExistingAssignment[]
  term: string
  academicYear: string
}

type Mode = 'add' | 'edit'

const CHUNK = 8

function cellKey(subjectId: string, classId: string) {
  return `${subjectId}:${classId}`
}

export default function AssignmentMatrix({
  teachers, classes, subjects, assignments, term, academicYear,
}: Props) {
  const router = useRouter()
  const [teacherId, setTeacherId] = useState('')
  const [mode, setMode] = useState<Mode>('add')
  const [staged, setStaged] = useState<Record<string, 'add' | 'delete'>>({})
  const [pending, startTransition] = useTransition()
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [confirmOpen, setConfirmOpen] = useState(false)

  const existingForTeacher = useMemo(() => {
    const map: Record<string, ExistingAssignment> = {}
    for (const a of assignments) {
      if (a.teacher_id === teacherId) map[cellKey(a.subject_id, a.class_id)] = a
    }
    return map
  }, [assignments, teacherId])

  const additions = useMemo(
    () => Object.entries(staged)
      .filter(([, v]) => v === 'add')
      .map(([k]) => {
        const [subjectId, classId] = k.split(':')
        return { subjectId, classId }
      }),
    [staged],
  )
  const deletions = useMemo(
    () => Object.entries(staged)
      .filter(([, v]) => v === 'delete')
      .map(([k]) => existingForTeacher[k]?.id)
      .filter(Boolean) as string[],
    [staged, existingForTeacher],
  )

  // In Edit mode, only show subjects the teacher already teaches — keeps the matrix
  // focused on rows the admin can actually act on (delete-only in Edit).
  const visibleSubjects = useMemo(() => {
    if (mode !== 'edit') return subjects
    const taught = new Set(Object.values(existingForTeacher).map((a) => a.subject_id))
    return subjects.filter((s) => taught.has(s.id))
  }, [mode, subjects, existingForTeacher])

  function toggleCell(subjectId: string, classId: string) {
    const k = cellKey(subjectId, classId)
    const existing = existingForTeacher[k]
    const current = staged[k]
    setStaged((s) => {
      const next = { ...s }
      if (existing) {
        if (mode === 'add') return s
        if (current === 'delete') delete next[k]
        else next[k] = 'delete'
      } else {
        // Edit mode is delete-only — never stage an addition.
        if (mode === 'edit') return s
        if (current === 'add') delete next[k]
        else next[k] = 'add'
      }
      return next
    })
  }

  function resetStaged() {
    setStaged({})
    setProgress({ done: 0, total: 0 })
  }

  async function submit() {
    if (!teacherId) return
    if (additions.length === 0 && deletions.length === 0) return

    const chunks: Array<{ additions: typeof additions; deletions: string[] }> = []
    for (let i = 0; i < additions.length; i += CHUNK) {
      chunks.push({ additions: additions.slice(i, i + CHUNK), deletions: [] })
    }
    if (deletions.length > 0) chunks.push({ additions: [], deletions })

    const totalOps = additions.length + deletions.length
    setProgress({ done: 0, total: totalOps })

    let totalAdded = 0
    let totalRemoved = 0

    startTransition(async () => {
      for (const chunk of chunks) {
        const r = await bulkUpdateTeacherAssignmentsAction({
          teacherId,
          term,
          academicYear,
          additions: chunk.additions,
          deletions: chunk.deletions,
        })
        if (r.error) {
          toast.error(r.error)
          setProgress({ done: 0, total: 0 })
          return
        }
        totalAdded += r.added
        totalRemoved += r.removed
        setProgress((p) => ({ ...p, done: p.done + chunk.additions.length + chunk.deletions.length }))
      }

      toast.success(
        `Saved · added ${totalAdded}, removed ${totalRemoved}`,
        { description: `${term} · ${academicYear}` },
      )
      setStaged({})
      setProgress({ done: 0, total: 0 })
      setTeacherId('')
      setMode('add')
      router.refresh()
    })
  }

  function handleApplyClick() {
    if (deletions.length > 0) setConfirmOpen(true)
    else submit()
  }

  const submitting = pending
  const diffCount = additions.length + deletions.length

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor="matrix-teacher" className="text-sm font-semibold text-ink flex-shrink-0">
          Teacher
        </label>
        <select
          id="matrix-teacher"
          value={teacherId}
          onChange={(e) => { setTeacherId(e.target.value); resetStaged() }}
          className="input-brand flex-1 max-w-md"
        >
          <option value="">— Select a teacher —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>

        <ModeToggle mode={mode} onChange={(m) => { setMode(m); setStaged({}) }} disabled={!teacherId} />
      </div>

      {!teacherId ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
          <Network className="w-7 h-7 mx-auto text-brand-accent/60" />
          <p className="text-sm font-medium text-ink mt-2">Pick a teacher to see the matrix</p>
          <p className="text-xs text-ink-muted mt-1">Tick the (subject × class) cells you want, then Apply.</p>
        </div>
      ) : (
        <>
          <MatrixGrid
            subjects={visibleSubjects}
            classes={classes}
            existingForTeacher={existingForTeacher}
            staged={staged}
            mode={mode}
            onToggle={toggleCell}
          />

          {mode === 'edit' && visibleSubjects.length === 0 && (
            <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/60 px-6 py-10 text-center">
              <Pencil className="w-7 h-7 mx-auto text-brand-accent/60" />
              <p className="text-sm font-medium text-ink mt-2">No subjects to edit</p>
              <p className="text-xs text-ink-muted mt-1">This teacher has no current assignments. Switch to Add to attach subjects.</p>
            </div>
          )}

          {/* Action bar */}
          <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 bg-white/95 backdrop-blur-md border-t border-surface-border flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="inline-flex items-center gap-1 font-medium text-brand-primary">
                <Plus className="w-3.5 h-3.5" /> {additions.length} to add
              </span>
              {mode === 'edit' && (
                <span className="inline-flex items-center gap-1 font-medium text-red-600">
                  <Minus className="w-3.5 h-3.5" /> {deletions.length} to remove
                </span>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {progress.total > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-32 h-1.5 bg-surface-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-300"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-ink-muted">{progress.done}/{progress.total}</span>
                </div>
              )}
              <button
                type="button"
                onClick={resetStaged}
                disabled={submitting || diffCount === 0}
                className="inline-flex items-center justify-center min-h-touch px-3 rounded-lg text-sm font-medium text-ink-muted hover:text-ink hover:bg-surface-muted cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleApplyClick}
                disabled={submitting || diffCount === 0}
                className="btn-brand disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving…' : `Apply ${diffCount} change${diffCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showClose={false}>
          <DialogTitle>Remove {deletions.length} assignment{deletions.length === 1 ? '' : 's'}?</DialogTitle>
          <DialogDescription>
            This teacher will lose access to grade entry for the rows below for {term} · {academicYear}.
            Existing grades stay in the database; only the assignment is removed.
          </DialogDescription>
          <ul className="mt-4 space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {Object.entries(staged)
              .filter(([, v]) => v === 'delete')
              .map(([k]) => {
                const [subjectId, classId] = k.split(':')
                const s = subjects.find((x) => x.id === subjectId)
                const c = classes.find((x) => x.id === classId)
                return (
                  <li key={k} className="text-sm text-ink flex items-center gap-2">
                    <X className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <span className="font-medium">{s?.name ?? '?'}</span>
                    <span className="text-ink-subtle">·</span>
                    <span className="font-mono text-xs text-brand-accent bg-brand-accent/10 px-1.5 py-0.5 rounded">{c?.name ?? '?'}</span>
                  </li>
                )
              })}
          </ul>
          <DialogFooter>
            <DialogClose className="btn-oauth">Cancel</DialogClose>
            <button
              type="button"
              onClick={() => { setConfirmOpen(false); submit() }}
              className="btn inline-flex bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
            >
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ModeToggle({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  return (
    <div
      role="tablist"
      aria-label="Matrix mode"
      className={cn(
        'inline-flex items-center bg-surface-muted rounded-lg p-0.5 ring-1 ring-surface-border',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      {(['add', 'edit'] as const).map((m) => {
        const active = mode === m
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold cursor-pointer transition-colors',
              active
                ? m === 'edit'
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-brand-primary text-white shadow-sm'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {m === 'add' ? <Plus className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {m === 'add' ? 'Add' : 'Edit'}
          </button>
        )
      })}
    </div>
  )
}

function MatrixGrid({
  subjects,
  classes,
  existingForTeacher,
  staged,
  mode,
  onToggle,
}: {
  subjects: SubjectRow[]
  classes: ClassRow[]
  existingForTeacher: Record<string, ExistingAssignment>
  staged: Record<string, 'add' | 'delete'>
  mode: Mode
  onToggle: (subjectId: string, classId: string) => void
}) {
  return (
    <>
      {/* Desktop: grid with sticky first column */}
      <div className="hidden sm:block overflow-x-auto rounded-xl ring-1 ring-surface-border">
        <table className="w-full border-collapse">
          <thead className="bg-surface-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-surface-muted px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-subtle border-b border-surface-border w-44">
                Subject
              </th>
              {classes.map((c) => (
                <th
                  key={c.id}
                  className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-brand-accent border-b border-surface-border"
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id} className="even:bg-surface-muted/30">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-inherit px-3 py-2 text-left text-sm font-semibold text-ink border-b border-surface-border w-44"
                >
                  {s.name}
                </th>
                {classes.map((c) => {
                  const k = cellKey(s.id, c.id)
                  return (
                    <td key={c.id} className="px-1 py-1 text-center border-b border-surface-border">
                      <Cell
                        kind={cellKind(existingForTeacher[k], staged[k], mode)}
                        onClick={() => onToggle(s.id, c.id)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: per-subject accordion */}
      <div className="sm:hidden space-y-2">
        {subjects.map((s) => (
          <details key={s.id} className="card overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink select-none flex items-center justify-between">
              <span>{s.name}</span>
              <CountBadge subject={s} classes={classes} existingForTeacher={existingForTeacher} staged={staged} mode={mode} />
            </summary>
            <div className="px-3 pb-3 grid grid-cols-2 gap-2">
              {classes.map((c) => {
                const k = cellKey(s.id, c.id)
                const kind = cellKind(existingForTeacher[k], staged[k], mode)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggle(s.id, c.id)}
                    disabled={kind === 'locked' || kind === 'empty-disabled'}
                    className={cn(
                      'inline-flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors',
                      kind === 'empty' && 'bg-white border-surface-border hover:border-brand-primary/50 text-ink',
                      kind === 'empty-disabled' && 'bg-surface-muted/60 border-surface-border text-ink-subtle/40 cursor-not-allowed',
                      kind === 'staged-add' && 'bg-brand-primary-light border-brand-primary text-brand-primary-dark',
                      kind === 'locked' && 'bg-surface-muted border-surface-border text-ink-subtle cursor-not-allowed',
                      kind === 'existing-editable' && 'bg-red-50/30 border-red-200 text-red-700',
                      kind === 'staged-delete' && 'bg-red-50 border-red-400 text-red-700 line-through',
                    )}
                  >
                    <span className="font-mono">{c.name}</span>
                    <span aria-hidden="true">
                      {kind === 'staged-add' && <Check className="w-3.5 h-3.5" />}
                      {kind === 'locked' && <Lock className="w-3 h-3" />}
                      {kind === 'existing-editable' && <Check className="w-3.5 h-3.5" />}
                      {kind === 'staged-delete' && <X className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </details>
        ))}
      </div>
    </>
  )
}

type CellKind = 'empty' | 'empty-disabled' | 'staged-add' | 'locked' | 'existing-editable' | 'staged-delete'

function cellKind(
  existing: ExistingAssignment | undefined,
  staged: 'add' | 'delete' | undefined,
  mode: Mode,
): CellKind {
  if (!existing) {
    if (mode === 'edit') return 'empty-disabled'
    return staged === 'add' ? 'staged-add' : 'empty'
  }
  if (mode === 'add') return 'locked'
  return staged === 'delete' ? 'staged-delete' : 'existing-editable'
}

function Cell({ kind, onClick }: { kind: CellKind; onClick: () => void }) {
  const base = 'inline-flex items-center justify-center w-9 h-9 rounded-md border text-xs cursor-pointer transition-colors'
  const styles: Record<CellKind, string> = {
    empty: 'bg-white border-surface-border hover:border-brand-primary hover:bg-brand-primary-light/50 text-ink-subtle',
    'empty-disabled': 'bg-surface-muted/60 border-surface-border text-ink-subtle/40 cursor-not-allowed',
    'staged-add': 'bg-brand-primary text-white border-brand-primary shadow-sm shadow-brand-primary/20',
    locked: 'bg-surface-muted border-surface-border text-ink-subtle cursor-not-allowed',
    'existing-editable': 'bg-brand-primary-light border-brand-primary/40 text-brand-primary-dark hover:bg-red-50 hover:border-red-300 hover:text-red-700',
    'staged-delete': 'bg-red-100 border-red-400 text-red-700',
  }
  const disabled = kind === 'locked' || kind === 'empty-disabled'
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(base, styles[kind])} aria-label={kind}>
      {kind === 'empty' && '+'}
      {kind === 'staged-add' && <Check className="w-4 h-4" strokeWidth={3} />}
      {kind === 'locked' && <Lock className="w-3 h-3" />}
      {kind === 'existing-editable' && <Check className="w-4 h-4" />}
      {kind === 'staged-delete' && <X className="w-4 h-4" strokeWidth={3} />}
    </button>
  )
}

function CountBadge({
  subject, classes, existingForTeacher, staged, mode,
}: {
  subject: SubjectRow
  classes: ClassRow[]
  existingForTeacher: Record<string, ExistingAssignment>
  staged: Record<string, 'add' | 'delete'>
  mode: Mode
}) {
  let active = 0
  let added = 0
  let removed = 0
  for (const c of classes) {
    const k = cellKey(subject.id, c.id)
    const e = existingForTeacher[k]
    const st = staged[k]
    if (e && st !== 'delete') active += 1
    if (!e && st === 'add') added += 1
    if (e && st === 'delete') removed += 1
  }
  const net = active + added
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-mono">
      <span className="text-ink-muted">{net} of {classes.length}</span>
      {added > 0 && <span className="text-brand-primary">+{added}</span>}
      {mode === 'edit' && removed > 0 && <span className="text-red-600">−{removed}</span>}
    </span>
  )
}
