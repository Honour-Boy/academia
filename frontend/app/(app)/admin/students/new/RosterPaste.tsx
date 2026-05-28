'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, Trash2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Class, Subject } from '@/types'
import { bulkEnrollStudentsAction } from '../actions'

interface Props {
  classes: (Class & { classTeacherName: string | null })[]
  subjects: Subject[]
}

interface ParsedRow {
  fullName: string
  studentNumber: string | null
  warn?: string
}

const CHUNK = 8

function parseRoster(text: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const tokens = line.split(/[,\t]+/).map((t) => t.trim()).filter(Boolean)
    if (tokens.length === 0) continue
    const fullName = tokens[0]
    const studentNumber = tokens[1] ?? null
    rows.push({
      fullName,
      studentNumber,
      warn: fullName.length < 2 ? 'Very short name — check before saving' : undefined,
    })
  }
  return rows
}

export default function RosterPaste({ classes, subjects }: Props) {
  const router = useRouter()
  const [classId, setClassId] = useState('')
  const [subjectIds, setSubjectIds] = useState<string[]>([])
  const [text, setText] = useState('')
  const [previewed, setPreviewed] = useState<ParsedRow[] | null>(null)
  const [results, setResults] = useState<{ enrolled: number; failed: Array<{ fullName: string; reason: string }> } | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [pending, startTransition] = useTransition()

  const liveParsed = useMemo(() => parseRoster(text), [text])

  function toggleSubject(id: string) {
    setSubjectIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]))
  }

  function preview() {
    setPreviewed(parseRoster(text))
    setResults(null)
  }

  function removeRow(idx: number) {
    if (!previewed) return
    setPreviewed(previewed.filter((_, i) => i !== idx))
  }

  function clear() {
    setText('')
    setPreviewed(null)
    setResults(null)
    setProgress({ done: 0, total: 0 })
  }

  async function submit() {
    if (!previewed || previewed.length === 0) return
    if (!classId) { toast.error('Pick a class first'); return }
    if (subjectIds.length === 0) { toast.error('Pick at least one subject'); return }

    const chunks: ParsedRow[][] = []
    for (let i = 0; i < previewed.length; i += CHUNK) {
      chunks.push(previewed.slice(i, i + CHUNK))
    }

    setProgress({ done: 0, total: previewed.length })
    let totalEnrolled = 0
    const allFailed: Array<{ fullName: string; reason: string }> = []

    startTransition(async () => {
      for (const chunk of chunks) {
        const r = await bulkEnrollStudentsAction({
          classId,
          subjectIds,
          students: chunk.map((s) => ({ fullName: s.fullName, studentNumber: s.studentNumber })),
        })
        totalEnrolled += r.enrolled
        allFailed.push(...r.failed)
        setProgress((p) => ({ ...p, done: p.done + chunk.length }))
      }

      setResults({ enrolled: totalEnrolled, failed: allFailed })
      if (allFailed.length === 0) {
        toast.success(`Enrolled ${totalEnrolled} student${totalEnrolled === 1 ? '' : 's'}`)
      } else {
        toast.warning(`Enrolled ${totalEnrolled}, ${allFailed.length} failed — see list below`)
      }
      router.refresh()
    })
  }

  const submitting = pending
  const failedNames = new Set((results?.failed ?? []).map((f) => f.fullName))

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="bulk-class" className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1.5">
          Class <span className="text-red-500">*</span>
        </label>
        <select
          id="bulk-class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="input-brand"
        >
          <option value="">— Select a class —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.classTeacherName ? ` — ${c.classTeacherName}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1.5">
          Subjects to apply to every student <span className="text-red-500">*</span>
        </p>
        <div className="card p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
          {subjects.map((s) => {
            const checked = subjectIds.includes(s.id)
            return (
              <label
                key={s.id}
                className={cn(
                  'flex items-center gap-2 text-sm cursor-pointer px-2 py-1.5 rounded transition-colors',
                  checked ? 'bg-brand-primary-light' : 'hover:bg-surface-muted',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSubject(s.id)}
                  className="w-4 h-4 accent-brand-primary rounded"
                />
                <span className={cn(checked ? 'text-brand-primary-dark font-semibold' : 'text-ink')}>
                  {s.name}
                </span>
              </label>
            )
          })}
        </div>
        <p className="text-xs text-ink-subtle mt-1">{subjectIds.length} selected</p>
      </div>

      <div>
        <label htmlFor="bulk-roster" className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1.5">
          Roster <span className="text-red-500">*</span>
        </label>
        <textarea
          id="bulk-roster"
          value={text}
          onChange={(e) => { setText(e.target.value); setPreviewed(null); setResults(null) }}
          rows={8}
          placeholder={`Paste one student per line. Formats accepted:\n  Adewale Okonkwo\n  Adewale Okonkwo, 2024/JSS/001\n  Adewale Okonkwo\\t2024/JSS/001`}
          className="input-brand font-mono text-sm leading-relaxed resize-y"
        />
        <p className="text-xs text-ink-subtle mt-1">{liveParsed.length} line{liveParsed.length === 1 ? '' : 's'} parsed</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={preview}
          disabled={liveParsed.length === 0}
          className="btn-oauth inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Eye className="w-4 h-4" />
          Preview {liveParsed.length > 0 ? `${liveParsed.length} students` : 'roster'}
        </button>
        {previewed && (
          <button
            type="button"
            onClick={clear}
            className="text-sm text-ink-muted hover:text-ink cursor-pointer px-2"
          >
            Clear
          </button>
        )}
      </div>

      {previewed && previewed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-muted border-b border-surface-border text-xs">
            <span className="font-semibold uppercase tracking-wider text-ink-subtle">Preview</span>
            <span className="text-ink-muted">·</span>
            <span className="text-ink-muted">{previewed.length} student{previewed.length === 1 ? '' : 's'}</span>
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-surface-border">
            {previewed.map((row, idx) => {
              const failed = failedNames.has(row.fullName)
              const reason = results?.failed.find((f) => f.fullName === row.fullName)?.reason
              return (
                <li
                  key={idx}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2',
                    failed && 'bg-red-50/60',
                    row.warn && !failed && 'bg-brand-secondary-light/40',
                  )}
                >
                  <span className="w-6 text-[11px] font-mono text-ink-subtle text-right">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{row.fullName}</p>
                    <p className="text-xs text-ink-subtle font-mono mt-0.5">
                      {row.studentNumber ?? '—'}
                    </p>
                  </div>
                  {failed && reason && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700">
                      <AlertCircle className="w-3.5 h-3.5" /> {reason}
                    </span>
                  )}
                  {row.warn && !failed && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-secondary-dark">
                      <AlertCircle className="w-3.5 h-3.5" /> {row.warn}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    aria-label={`Remove ${row.fullName}`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-subtle hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {results && (
        <div className={cn(
          'rounded-xl p-4 border text-sm',
          results.failed.length === 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-brand-secondary-light border-brand-secondary/40 text-brand-accent-dark',
        )}>
          <p className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {results.enrolled} enrolled
            {results.failed.length > 0 && ` · ${results.failed.length} failed`}
          </p>
          {results.failed.length === 0 && (
            <p className="text-xs mt-1">All clear. They&apos;ll show up in /admin/students.</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-surface-border">
        {progress.total > 0 && (
          <div className="flex items-center gap-2 flex-1 min-w-[140px]">
            <div className="flex-1 h-1.5 bg-surface-border rounded-full overflow-hidden">
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
          onClick={submit}
          disabled={submitting || !previewed || previewed.length === 0 || !classId || subjectIds.length === 0}
          className="btn-brand ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling…</>
          ) : (
            <>Enrol {previewed?.length ?? 0} student{(previewed?.length ?? 0) === 1 ? '' : 's'}</>
          )}
        </button>
      </div>
    </div>
  )
}
