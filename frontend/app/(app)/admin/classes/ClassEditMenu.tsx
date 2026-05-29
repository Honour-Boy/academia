'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2, Loader2, AlertTriangle, Save } from 'lucide-react'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter,
} from '@/components/ui/Dialog'
import { updateClassArmAction, deleteClassAction } from './actions'

interface Props {
  classId: string
  level: string
  arm: string
  className: string
}

/**
 * Per-class edit/delete menu for /admin/classes.
 *
 * - Rename arm → re-derives the display name. Old arm "A" → new arm "Topaz"
 *   turns "JSS 1A" into "JSS 1 Topaz".
 * - Delete → blocked server-side when students are still enrolled. Confirmed
 *   by typing the class name to avoid foot-shooting.
 */
export default function ClassEditMenu({ classId, level, arm, className }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [newArm, setNewArm] = useState(arm)
  const [confirmName, setConfirmName] = useState('')
  const [pending, startTransition] = useTransition()

  function preview(): string {
    const trimmed = newArm.trim()
    if (!trimmed) return className
    return trimmed.length === 1 ? `${level}${trimmed}` : `${level} ${trimmed}`
  }

  function saveArm() {
    const trimmed = newArm.trim()
    if (!trimmed) {
      toast.error('Arm cannot be empty.')
      return
    }
    if (trimmed === arm.trim()) {
      setEditOpen(false)
      return
    }
    startTransition(async () => {
      const res = await updateClassArmAction(classId, trimmed)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Renamed to ${preview()}`)
      setEditOpen(false)
    })
  }

  function confirmDelete() {
    if (confirmName.trim() !== className.trim()) {
      toast.error('Typed name does not match — delete cancelled')
      return
    }
    startTransition(async () => {
      const res = await deleteClassAction(classId)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(`${className} deleted`)
      setDeleteOpen(false)
    })
  }

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          aria-label={`Rename ${className}`}
          title="Rename arm"
          onClick={() => { setNewArm(arm); setEditOpen(true) }}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${className}`}
          title="Delete class"
          onClick={() => { setConfirmName(''); setDeleteOpen(true) }}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Rename */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {className}</DialogTitle>
            <DialogDescription>
              The display name is derived from the level + arm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="arm" className="block text-xs font-medium uppercase tracking-wider text-ink-subtle">
              New arm
            </label>
            <input
              id="arm"
              type="text"
              value={newArm}
              onChange={(e) => setNewArm(e.target.value)}
              maxLength={20}
              autoComplete="off"
              className="input-brand"
              placeholder="A, Topaz, Emerald…"
            />
            <p className="text-xs text-ink-muted">
              Will rename to <span className="font-mono font-semibold text-ink">{preview()}</span>
            </p>
          </div>
          <DialogFooter>
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => setEditOpen(false)}>Cancel</button>
            <button type="button" className="btn-brand" disabled={pending || !newArm.trim()} onClick={saveArm}>
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save</>}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setConfirmName('') }}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 text-red-600">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <DialogTitle>Delete {className}?</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Removes the class plus any teacher/class-teacher assignments. Blocked if any students are still enrolled.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="confirm" className="block text-xs font-medium uppercase tracking-wider text-ink-subtle mb-1.5">
              Type <span className="font-mono normal-case text-ink">{className}</span> to confirm
            </label>
            <input
              id="confirm"
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              className="input-brand"
            />
          </div>
          <DialogFooter>
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => setDeleteOpen(false)}>Cancel</button>
            <button
              type="button"
              className="btn-brand bg-red-600 hover:bg-red-700 disabled:opacity-50"
              disabled={pending || confirmName.trim() !== className.trim()}
              onClick={confirmDelete}
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
