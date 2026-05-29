'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Save } from 'lucide-react'
import { validateScale, letterClasses, type GradingScaleRow } from '@/lib/grading-scale'
import { saveGradingScaleAction, type ScaleInputRow } from './grading-actions'

interface Props {
  initial: GradingScaleRow[]
}

interface EditableRow {
  letter: string
  min_percentage: number
  description: string
}

function toEditable(rows: GradingScaleRow[]): EditableRow[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      letter: r.letter,
      min_percentage: r.min_percentage,
      description: r.description ?? '',
    }))
}

/**
 * Admin grading scale editor.
 *
 * Each row carries a letter, a min% floor, and an optional description. The
 * upper bound for a row is implicit (the previous row's min − 1). Rows are
 * ordered top → bottom by sort_order, which we reassign from the array
 * index on save — so dragging via the up/down arrows just works.
 *
 * Live validation surfaces the same rules the server enforces: descending
 * mins, no duplicates, contiguous, lowest at 0.
 */
export default function GradingScaleEditor({ initial }: Props) {
  const [rows, setRows] = useState<EditableRow[]>(() => toEditable(initial))
  const [pending, startTransition] = useTransition()

  const validity = useMemo(() => {
    const candidate: GradingScaleRow[] = rows.map((r, i) => ({
      letter: r.letter.trim(),
      min_percentage: r.min_percentage,
      description: r.description.trim() || null,
      sort_order: i + 1,
    }))
    return validateScale(candidate)
  }, [rows])

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
      toast.error('At least one letter is required.')
      return
    }
    setRows((rs) => rs.filter((_, i) => i !== idx))
  }

  function add() {
    // New row defaults to one below the lowest letter, starting at min=0 if
    // empty list, otherwise pick the previous row's min − 1 (clamped to 0).
    const last = rows[rows.length - 1]
    const nextMin = last ? Math.max(0, last.min_percentage - 5) : 0
    setRows((rs) => [...rs, { letter: '', min_percentage: nextMin, description: '' }])
  }

  function save() {
    if ('error' in validity) {
      toast.error(validity.error)
      return
    }
    const payload: ScaleInputRow[] = rows.map((r) => ({
      letter: r.letter.trim(),
      min_percentage: r.min_percentage,
      description: r.description.trim() || null,
    }))
    startTransition(async () => {
      const res = await saveGradingScaleAction(payload)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Grading scale saved.')
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((r, idx) => {
          const upperBound = idx === 0 ? 100 : rows[idx - 1].min_percentage - 1
          return (
            <div
              key={idx}
              className="grid grid-cols-[auto_5rem_5rem_1fr_auto] gap-2 items-center bg-surface-muted/40 border border-surface-border rounded-lg px-2 py-2"
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
                aria-label="Letter"
                value={r.letter}
                onChange={(e) => update(idx, { letter: e.target.value.toUpperCase() })}
                placeholder="A1"
                maxLength={4}
                className={`input-brand text-center font-bold font-mono px-1 ${letterClasses(r.letter.trim())}`}
              />

              <input
                aria-label="Minimum percentage"
                type="number"
                min={0}
                max={100}
                step={1}
                value={r.min_percentage}
                onChange={(e) => update(idx, { min_percentage: parseInt(e.target.value || '0', 10) || 0 })}
                className="input-brand text-center font-mono px-1"
              />

              <div className="flex items-center gap-2 min-w-0">
                <input
                  aria-label="Description"
                  value={r.description}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  placeholder="Excellent / Credit / Pass …"
                  className="input-brand flex-1 min-w-0"
                />
                <span className="text-[11px] text-ink-subtle font-mono whitespace-nowrap">
                  {r.min_percentage}–{upperBound}%
                </span>
              </div>

              <button
                type="button"
                aria-label="Remove letter"
                onClick={() => remove(idx)}
                disabled={rows.length <= 1}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-subtle hover:text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={add}
        className="btn-secondary text-sm inline-flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> Add letter
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
          Save scale
        </button>
      </div>
    </div>
  )
}
