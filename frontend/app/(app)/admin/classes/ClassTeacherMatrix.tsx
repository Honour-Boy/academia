'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { GraduationCap, Loader2, Save, Users, RotateCcw } from 'lucide-react'
import { Combobox } from '@/components/ui/Combobox'
import { cn } from '@/lib/cn'
import {
  assignClassTeacherAction,
  bulkAssignClassTeachersAction,
} from '../students/actions'
import ClassEditMenu from './ClassEditMenu'

interface ClassRow {
  id: string
  name: string
  level: string
  arm: string
}

interface Teacher {
  id: string
  full_name: string
}

interface Props {
  classes: ClassRow[]
  teachers: Teacher[]
  /** Map<classId, teacherId> of the currently-saved assignments for this term. */
  initialAssignments: Record<string, string>
  term: string
  academicYear: string
}

export default function ClassTeacherMatrix({
  classes, teachers, initialAssignments, term, academicYear,
}: Props) {
  const router = useRouter()
  // Baseline reflects what's saved in the DB right now. Drafts are what the
  // admin has picked locally. A row is dirty when draft !== baseline.
  const [baseline, setBaseline] = useState<Record<string, string>>(initialAssignments)
  const [drafts, setDrafts] = useState<Record<string, string>>(initialAssignments)
  const [savingRow, setSavingRow] = useState<string | null>(null)
  const [bulkPending, startBulk] = useTransition()

  // Teacher IDs currently in use across drafts. Used to disable them in other
  // class dropdowns (with a "(assigned to JSS 1A)" hint) so the admin can see
  // *why* a teacher can't be picked, rather than silently filtering them out.
  // A teacher can only hold one class-teacher slot per term.
  const usedByDraft = useMemo(() => {
    const map = new Map<string, string>() // teacherId → classId
    for (const [classId, teacherId] of Object.entries(drafts)) {
      if (teacherId) map.set(teacherId, classId)
    }
    return map
  }, [drafts])

  // Class lookup so we can render the "(assigned to <className>)" hint.
  const classNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of classes) m.set(c.id, c.name)
    return m
  }, [classes])

  function setDraft(classId: string, teacherId: string) {
    setDrafts((d) => ({ ...d, [classId]: teacherId }))
  }

  const dirtyClassIds = useMemo(
    () => classes.filter((c) => (drafts[c.id] ?? '') !== (baseline[c.id] ?? '')).map((c) => c.id),
    [classes, drafts, baseline],
  )

  function resetAll() {
    setDrafts(baseline)
  }

  async function saveRow(classId: string) {
    const teacherId = drafts[classId] ?? ''
    setSavingRow(classId)
    const fd = new FormData()
    fd.set('class_id', classId)
    fd.set('teacher_id', teacherId)
    fd.set('term', term)
    fd.set('academic_year', academicYear)
    const r = await assignClassTeacherAction(fd)
    setSavingRow(null)
    if (r && 'error' in r) {
      toast.error(r.error)
      return
    }
    setBaseline((b) => ({ ...b, [classId]: teacherId }))
    toast.success(teacherId ? 'Class teacher assigned' : 'Class teacher unassigned')
    router.refresh()
  }

  function saveAll() {
    if (dirtyClassIds.length === 0) return
    const rows = dirtyClassIds.map((classId) => ({
      classId,
      teacherId: drafts[classId] || null,
    }))
    startBulk(async () => {
      const r = await bulkAssignClassTeachersAction({ rows, term, academicYear })
      if (r.failed.length === 0) {
        toast.success(`Saved ${r.saved} change${r.saved === 1 ? '' : 's'}`)
      } else {
        toast.warning(`Saved ${r.saved}, ${r.failed.length} failed`)
      }
      // Update baseline only for rows that succeeded.
      const failedIds = new Set(r.failed.map((f) => f.classId))
      setBaseline((b) => {
        const next = { ...b }
        for (const id of dirtyClassIds) {
          if (!failedIds.has(id)) next[id] = drafts[id] ?? ''
        }
        return next
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Sticky bulk-save bar (only when there are unsaved changes) */}
      {dirtyClassIds.length > 0 && (
        <div className="sticky top-[68px] z-20 -mx-3 sm:mx-0">
          <div className="card flex items-center gap-3 px-4 py-3 shadow-md ring-1 ring-brand-primary/30 bg-brand-primary-light/40">
            <Save className="w-4 h-4 text-brand-primary-dark flex-shrink-0" />
            <p className="text-sm text-ink flex-1 min-w-0 truncate">
              <span className="font-semibold">{dirtyClassIds.length}</span> unsaved change{dirtyClassIds.length === 1 ? '' : 's'}
            </p>
            <button
              type="button"
              onClick={resetAll}
              disabled={bulkPending}
              className="text-xs text-ink-muted hover:text-ink cursor-pointer inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={bulkPending}
              className="btn-brand btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <>Assign all ({dirtyClassIds.length})</>}
            </button>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
        {classes.map((cls) => {
          const draftTeacherId = drafts[cls.id] ?? ''
          const baselineTeacherId = baseline[cls.id] ?? ''
          const isDirty = draftTeacherId !== baselineTeacherId
          const isAssigned = !!baselineTeacherId
          const isSaving = savingRow === cls.id

          // A teacher can only hold one class-teacher slot per term. Keep
          // every teacher visible — disable the ones already drafted on
          // another class and show *which* class so the admin understands
          // why they can't pick them again here.
          const options = teachers.map((t) => {
            const usedByOther = usedByDraft.get(t.id)
            const conflict = usedByOther && usedByOther !== cls.id
            return {
              value: t.id,
              label: t.full_name,
              disabled: !!conflict,
              secondary: conflict
                ? `assigned to ${classNameById.get(usedByOther!) ?? usedByOther}`
                : undefined,
            }
          })

          return (
            <div
              key={cls.id}
              className={cn(
                'card p-4 sm:p-5 flex flex-col gap-4 hover:shadow-md transition-shadow',
                isDirty && 'ring-1 ring-brand-primary/40',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-accent/10 text-brand-accent flex-shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink text-base font-mono">{cls.name}</p>
                    <p className="text-xs text-ink-muted">{cls.level} · Arm {cls.arm}</p>
                  </div>
                </div>
                <ClassEditMenu
                  classId={cls.id}
                  level={cls.level}
                  arm={cls.arm}
                  className={cls.name}
                />
                {isDirty ? (
                  <span className="inline-flex items-center gap-1 text-[11px] bg-brand-secondary-light text-brand-secondary-dark font-medium px-2 py-1 rounded-full whitespace-nowrap">
                    unsaved
                  </span>
                ) : isAssigned ? (
                  <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 font-medium px-2 py-1 rounded-full whitespace-nowrap">
                    <Users className="w-3 h-3" /> assigned
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-subtle whitespace-nowrap">unassigned</span>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Class teacher</p>
                <div className="flex items-center gap-2">
                  <Combobox
                    className="flex-1"
                    value={draftTeacherId}
                    onChange={(v) => setDraft(cls.id, v)}
                    options={options}
                    placeholder="— Assign class teacher —"
                    searchPlaceholder="Search teachers…"
                    clearable
                  />
                  {/* Only show the per-row Assign button when this row is dirty. */}
                  {isDirty && (
                    <button
                      type="button"
                      onClick={() => saveRow(cls.id)}
                      disabled={isSaving || bulkPending}
                      className="btn-primary btn-sm whitespace-nowrap disabled:opacity-50"
                    >
                      {isSaving
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : draftTeacherId
                          ? 'Assign'
                          : 'Unassign'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
