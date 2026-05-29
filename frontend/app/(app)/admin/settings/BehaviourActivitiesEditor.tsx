'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Save, EyeOff, Eye } from 'lucide-react'
import { validateActivities, type BehaviourActivityRow } from '@/lib/behaviour'
import { saveBehaviourActivitiesAction, type ActivityInput } from './behaviour-actions'

interface Props {
  initial: BehaviourActivityRow[]
}

interface EditableRow {
  id?: string
  name: string
  description: string
  is_active: boolean
}

function toEditable(rows: BehaviourActivityRow[]): EditableRow[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      is_active: r.is_active,
    }))
}

export default function BehaviourActivitiesEditor({ initial }: Props) {
  const [rows, setRows] = useState<EditableRow[]>(() => toEditable(initial))
  const [pending, startTransition] = useTransition()

  const validity = useMemo(
    () =>
      validateActivities(rows.map((r, i) => ({ name: r.name, sort_order: i + 1 }))),
    [rows],
  )

  function update(idx: number, patch: Partial<EditableRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir
    if (next < 0 || next >= rows.length) return
    setRows((rs) => {
      const copy = [...rs]
      const [moved] = copy.splice(idx, 1)
      copy.splice(next, 0, moved)
      return copy
    })
  }

  function remove(idx: number) {
    if (rows.length <= 1) {
      toast.error('Keep at least one activity.')
      return
    }
    setRows((rs) => rs.filter((_, i) => i !== idx))
  }

  function add() {
    setRows((rs) => [...rs, { name: '', description: '', is_active: true }])
  }

  function save() {
    if ('error' in validity) {
      toast.error(validity.error)
      return
    }
    const payload: ActivityInput[] = rows.map((r) => ({
      id: r.id,
      name: r.name.trim(),
      description: r.description.trim() || null,
      is_active: r.is_active,
    }))
    startTransition(async () => {
      const res = await saveBehaviourActivitiesAction(payload)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Behaviour activities saved.')
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        Class teachers score every active activity per student per term on a 1–5 scale.
        Toggle <span className="font-semibold">Active</span> off to retire an activity
        without losing past scores; delete only when you&apos;re sure the historical scores
        can go too.
      </p>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div
            key={idx}
            className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center bg-surface-muted/40 border border-surface-border rounded-lg px-2 py-2"
          >
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="Move up"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="inline-flex items-center justify-center w-6 h-5 rounded hover:bg-surface-muted text-ink-subtle hover:text-ink cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move down"
                onClick={() => move(idx, 1)}
                disabled={idx === rows.length - 1}
                className="inline-flex items-center justify-center w-6 h-5 rounded hover:bg-surface-muted text-ink-subtle hover:text-ink cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <input
              aria-label="Activity name"
              value={r.name}
              onChange={(e) => update(idx, { name: e.target.value })}
              placeholder="Punctuality / Neatness / …"
              maxLength={120}
              className={
                'input-brand ' +
                (r.is_active ? '' : 'opacity-60')
              }
            />

            <button
              type="button"
              onClick={() => update(idx, { is_active: !r.is_active })}
              title={r.is_active ? 'Hide from class teacher matrix' : 'Re-enable for class teachers'}
              className={
                'inline-flex items-center gap-1 px-2 h-8 rounded-md text-xs font-medium cursor-pointer transition-colors ' +
                (r.is_active
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-surface-muted text-ink-muted hover:bg-surface-muted/80')
              }
            >
              {r.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {r.is_active ? 'Active' : 'Hidden'}
            </button>

            <button
              type="button"
              aria-label="Remove activity"
              onClick={() => remove(idx)}
              disabled={rows.length <= 1}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-subtle hover:text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="btn-secondary text-sm inline-flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> Add activity
      </button>

      {'error' in validity && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {validity.error}
        </div>
      )}

      <div className="pt-3 border-t border-surface-border flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || 'error' in validity}
          className="btn-brand inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save activities
        </button>
      </div>
    </div>
  )
}
