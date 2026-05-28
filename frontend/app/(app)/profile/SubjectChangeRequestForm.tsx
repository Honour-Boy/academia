'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Send, X, Clock, Check, Plus, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  cancelSubjectChangeRequestAction,
  submitSubjectChangeRequestAction,
} from './actions'

interface Subject { id: string; name: string }

interface Props {
  availableSubjects: Subject[]
  currentSubjectIds: string[]
  pendingRequest: { id: string; created_at: string; subjectIds: string[] } | null
}

export default function SubjectChangeRequestForm({
  availableSubjects, currentSubjectIds, pendingRequest,
}: Props) {
  const router = useRouter()
  // Selection starts from the pending request if one exists (so a teacher who
  // already submitted can tweak it without re-starting), otherwise from their
  // currently-approved subjects.
  const initialSelection = pendingRequest?.subjectIds ?? currentSubjectIds
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelection))
  const [pending, startTransition] = useTransition()
  const [pendingCancel, startCancel] = useTransition()

  function toggle(subjectId: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(subjectId)) next.delete(subjectId)
      else next.add(subjectId)
      return next
    })
  }

  const current = useMemo(() => new Set(currentSubjectIds), [currentSubjectIds])
  const additions = useMemo(
    () => Array.from(selected).filter((id) => !current.has(id)),
    [selected, current],
  )
  const removals = useMemo(
    () => Array.from(current).filter((id) => !selected.has(id)),
    [selected, current],
  )
  const hasDiff = additions.length > 0 || removals.length > 0

  function submit() {
    if (!hasDiff) {
      toast.info('No changes to request')
      return
    }
    startTransition(async () => {
      const result = await submitSubjectChangeRequestAction({
        subjectIds: Array.from(selected),
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Change request submitted. An admin will review it.')
      router.refresh()
    })
  }

  function cancel() {
    if (!pendingRequest) return
    startCancel(async () => {
      const result = await cancelSubjectChangeRequestAction(pendingRequest.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Request cancelled.')
      setSelected(new Set(currentSubjectIds))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {pendingRequest && (
        <div className="rounded-lg bg-brand-secondary-light border border-brand-secondary/30 px-3 py-2.5 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-brand-secondary-dark flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-xs text-brand-accent-dark">
            <p>
              <span className="font-semibold">A change request is pending.</span>{' '}
              Submitted {new Date(pendingRequest.created_at).toLocaleString()}.
            </p>
            <p className="mt-0.5 text-ink-muted">
              You can edit the selection below and re-submit (replaces the pending one), or cancel it.
            </p>
          </div>
          <button
            type="button"
            onClick={cancel}
            disabled={pendingCancel}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-red-700 cursor-pointer disabled:opacity-50 flex-shrink-0"
          >
            {pendingCancel ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Cancel request
          </button>
        </div>
      )}

      {availableSubjects.length === 0 ? (
        <p className="text-sm text-ink-muted italic">No subjects on file in the catalogue yet.</p>
      ) : (
        <div className="card p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
          {availableSubjects.map((s) => {
            const isSelected = selected.has(s.id)
            const isCurrent = current.has(s.id)
            return (
              <label
                key={s.id}
                className={cn(
                  'flex items-center gap-2 text-sm cursor-pointer py-1.5 px-2 rounded transition-colors',
                  isSelected && !isCurrent && 'bg-brand-primary-light/60',
                  !isSelected && isCurrent && 'bg-red-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(s.id)}
                  className="w-4 h-4 accent-brand rounded"
                />
                <span className="text-ink flex-1 min-w-0 truncate">{s.name}</span>
                {isCurrent && !isSelected && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                    removing
                  </span>
                )}
                {!isCurrent && isSelected && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-brand-primary text-white px-1.5 py-0.5 rounded">
                    adding
                  </span>
                )}
                {isCurrent && isSelected && (
                  <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                )}
              </label>
            )
          })}
        </div>
      )}

      {hasDiff && (
        <div className="rounded-lg bg-surface-muted/60 border border-surface-border px-3 py-2 text-xs text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-ink">Pending diff:</span>
          {additions.length > 0 && (
            <span className="inline-flex items-center gap-1 text-brand-primary-dark">
              <Plus className="w-3 h-3" /> {additions.length} to add
            </span>
          )}
          {removals.length > 0 && (
            <span className="inline-flex items-center gap-1 text-red-700">
              <Minus className="w-3 h-3" /> {removals.length} to remove
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !hasDiff}
          className="btn-brand disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            : <><Send className="w-4 h-4" /> {pendingRequest ? 'Re-submit request' : 'Submit for approval'}</>}
        </button>
        {hasDiff && !pending && (
          <button
            type="button"
            onClick={() => setSelected(new Set(currentSubjectIds))}
            className="text-sm text-ink-muted hover:text-ink cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
