'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { saveReportFieldSettingsAction, type ReportFieldFlags } from './report-fields-actions'

interface Props {
  initial: ReportFieldFlags
}

/**
 * Four checkbox toggles for the optional report-sheet fields. Saved as a
 * single row of `report_field_settings`. No row-level state is needed beyond
 * the four booleans; the editor stays in lockstep with what the server
 * persisted.
 */
export default function ReportFieldsEditor({ initial }: Props) {
  const [flags, setFlags] = useState<ReportFieldFlags>(initial)
  const [pending, startTransition] = useTransition()
  const dirty =
    flags.show_class_average !== initial.show_class_average
    || flags.show_class_highest !== initial.show_class_highest
    || flags.show_position !== initial.show_position
    || flags.show_previous_terms !== initial.show_previous_terms

  function update(patch: Partial<ReportFieldFlags>) {
    setFlags((f) => ({ ...f, ...patch }))
  }

  function save() {
    startTransition(async () => {
      const res = await saveReportFieldSettingsAction(flags)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Report fields updated.')
    })
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        <ToggleRow
          label="Class average"
          help="Per-subject average across the whole class on each row."
          checked={flags.show_class_average}
          onChange={(v) => update({ show_class_average: v })}
        />
        <ToggleRow
          label="Class highest"
          help="Top score in the class for each subject."
          checked={flags.show_class_highest}
          onChange={(v) => update({ show_class_highest: v })}
        />
        <ToggleRow
          label="Position in class"
          help="Rank against other students in the same class (competition ranking)."
          checked={flags.show_position}
          onChange={(v) => update({ show_position: v })}
        />
        <ToggleRow
          label="Previous-term scores"
          help="Adds a column for last term's score. Second-term reports show First Term; Third-term reports show First + Second."
          checked={flags.show_previous_terms}
          onChange={(v) => update({ show_previous_terms: v })}
        />
      </ul>

      <div className="pt-3 border-t border-surface-border flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="btn-brand inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save fields
        </button>
      </div>
    </div>
  )
}

function ToggleRow({
  label, help, checked, onChange,
}: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-surface-muted/40 border border-surface-border">
      <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-brand rounded mt-0.5 flex-shrink-0"
        />
        <span className="min-w-0">
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="text-xs text-ink-muted mt-0.5">{help}</p>
        </span>
      </label>
    </li>
  )
}
