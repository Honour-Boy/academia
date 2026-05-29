'use client'

import { ChevronsDown, ChevronsUp } from 'lucide-react'

interface Props {
  allOpen: boolean
  anyOpen: boolean
  onExpandAll: () => void
  onCollapseAll: () => void
  /** Optional label noun, e.g. "classes" or "teachers". */
  noun?: string
}

/**
 * Pair of small Expand-all / Collapse-all buttons for any list whose rows
 * use a controlled boolean-open state map. Disabled when the action is a
 * no-op (already fully open / fully closed).
 */
export default function ExpandCollapseToggle({
  allOpen, anyOpen, onExpandAll, onCollapseAll, noun,
}: Props) {
  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={onExpandAll}
        disabled={allOpen}
        className="inline-flex items-center gap-1 px-2 h-7 rounded-md font-medium text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronsDown className="w-3.5 h-3.5" />
        <span>Expand all{noun ? ` ${noun}` : ''}</span>
      </button>
      <button
        type="button"
        onClick={onCollapseAll}
        disabled={!anyOpen}
        className="inline-flex items-center gap-1 px-2 h-7 rounded-md font-medium text-ink-muted hover:text-brand-primary hover:bg-brand-primary-light cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronsUp className="w-3.5 h-3.5" />
        <span>Collapse all</span>
      </button>
    </div>
  )
}
