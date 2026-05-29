'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Eye, Trash2, AlertCircle, CheckCircle2, Loader2,
  ClipboardPaste, FileSpreadsheet, FileUp, X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Class, Subject } from '@/types'
import { bulkEnrollStudentsAction } from '../actions'
import {
  parsePastedRoster, resolveRows, fromSpreadsheetRows, rowIsSubmittable, rowSkipReason,
  suggestSubjects,
  type ResolvedRow,
} from './roster-parser'

interface Props {
  classes: (Class & { classTeacherName: string | null })[]
  subjects: Subject[]
}

type InputMode = 'paste' | 'upload'

// Push one student at a time so the progress bar advances per row and the
// admin can watch succeeded/failed counts move in real time. Previously
// CHUNK=8 made a 5-student paste look like 0/5 → 5/5 with no intermediate.
const CHUNK = 1

export default function RosterImport({ classes, subjects }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<InputMode>('paste')
  const [text, setText] = useState('')
  const [previewed, setPreviewed] = useState<ResolvedRow[] | null>(null)
  const [results, setResults] = useState<{ enrolled: number; failed: Array<{ fullName: string; reason: string }> } | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, succeeded: 0, failed: 0 })
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadName, setUploadName] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const catalogue = useMemo(
    () => ({
      classes: classes.map((c) => ({ id: c.id, name: c.name })),
      subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
    }),
    [classes, subjects],
  )

  const liveParsed = useMemo(() => {
    if (mode !== 'paste' || !text.trim()) return [] as ResolvedRow[]
    return resolveRows(parsePastedRoster(text), catalogue)
  }, [mode, text, catalogue])

  function preview() {
    if (mode === 'paste') {
      setPreviewed(resolveRows(parsePastedRoster(text), catalogue))
      setResults(null)
    }
  }

  function removeRow(idx: number) {
    if (!previewed) return
    setPreviewed(previewed.filter((_, i) => i !== idx))
  }

  // Click-to-fix: swap an unmatched subject for a catalogue suggestion on the
  // specific preview row. Mutates only the previewed state, not the source
  // textarea — the admin still sees their original paste verbatim.
  function applySubjectFix(rowIdx: number, originalRaw: string, replacement: { id: string; name: string }) {
    if (!previewed) return
    setPreviewed(previewed.map((row, i) => {
      if (i !== rowIdx) return row
      const subjectIds = row.subjectIds.includes(replacement.id)
        ? row.subjectIds
        : [...row.subjectIds, replacement.id]
      const subjectsRaw = row.subjectsRaw.map((s) => s === originalRaw ? replacement.name : s)
      const unmatchedSubjects = row.unmatchedSubjects.filter((s) => s !== originalRaw)
      return { ...row, subjectIds, subjectsRaw, unmatchedSubjects }
    }))
  }

  function clear() {
    setText('')
    setPreviewed(null)
    setResults(null)
    setProgress({ done: 0, total: 0, succeeded: 0, failed: 0 })
    setUploadError(null)
    setUploadName(null)
  }

  async function handleFile(file: File) {
    setUploadError(null)
    setUploadName(file.name)
    setResults(null)
    const lower = file.name.toLowerCase()
    try {
      if (lower.endsWith('.csv') || file.type === 'text/csv') {
        // Lazy-load papaparse — only needed when the admin picks a CSV.
        const Papa = (await import('papaparse')).default
        const buf = await file.text()
        const parsed = Papa.parse<string[]>(buf, { skipEmptyLines: true })
        if (parsed.errors.length > 0) {
          setUploadError(`CSV parse error: ${parsed.errors[0].message}`)
          return
        }
        const data = parsed.data
        if (data.length === 0) {
          setUploadError('File is empty')
          return
        }
        const [headers, ...rows] = data
        const inputRows = fromSpreadsheetRows(headers, rows)
        if (inputRows.length === 0) {
          setUploadError('Could not find a "Name" column. Expected headers: Name, Student ID, Class, Subjects.')
          return
        }
        setPreviewed(resolveRows(inputRows, catalogue))
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        // Lazy-load xlsx — ~100 KB, only needed for spreadsheet uploads.
        const XLSX = await import('xlsx')
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false })
        if (data.length === 0) {
          setUploadError('File is empty')
          return
        }
        const [headers, ...rows] = data
        const inputRows = fromSpreadsheetRows(headers, rows)
        if (inputRows.length === 0) {
          setUploadError('Could not find a "Name" column. Expected headers: Name, Student ID, Class, Subjects.')
          return
        }
        setPreviewed(resolveRows(inputRows, catalogue))
      } else {
        setUploadError('Unsupported file type. Use .csv, .xlsx, or .xls.')
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to read file')
    }
  }

  async function submit() {
    if (!previewed || previewed.length === 0) return
    const submittable = previewed.filter(rowIsSubmittable)
    if (submittable.length === 0) {
      toast.error('No rows are submittable — every row needs a matched class and at least one matched subject')
      return
    }

    const chunks: ResolvedRow[][] = []
    for (let i = 0; i < submittable.length; i += CHUNK) {
      chunks.push(submittable.slice(i, i + CHUNK))
    }

    setProgress({ done: 0, total: submittable.length, succeeded: 0, failed: 0 })
    setResults(null)
    let totalEnrolled = 0
    const allFailed: Array<{ fullName: string; reason: string }> = []

    startTransition(async () => {
      for (const chunk of chunks) {
        const r = await bulkEnrollStudentsAction({
          students: chunk.map((s) => ({
            fullName: s.fullName,
            studentNumber: s.studentNumber,
            classId: s.classId!,
            subjectIds: s.subjectIds,
          })),
        })
        totalEnrolled += r.enrolled
        allFailed.push(...r.failed)
        // Update per-chunk so the user watches succeeded / failed counters tick
        // in real time alongside the progress bar.
        setProgress((p) => ({
          done: p.done + chunk.length,
          total: p.total,
          succeeded: p.succeeded + r.enrolled,
          failed: p.failed + r.failed.length,
        }))
      }

      setResults({ enrolled: totalEnrolled, failed: allFailed })
      if (allFailed.length === 0) {
        toast.success(`Enrolled ${totalEnrolled} student${totalEnrolled === 1 ? '' : 's'}`)
      } else if (totalEnrolled > 0) {
        toast.warning(`Enrolled ${totalEnrolled}, ${allFailed.length} failed — see list below`)
      } else {
        toast.error(`None of the ${allFailed.length} rows could be enrolled — see list below`)
      }
      router.refresh()
    })
  }

  const submitting = pending
  const failedNames = new Set((results?.failed ?? []).map((f) => f.fullName))
  const submittableCount = previewed?.filter(rowIsSubmittable).length ?? 0
  const skippedCount = (previewed?.length ?? 0) - submittableCount

  return (
    <div className="space-y-5">
      {/* Input mode toggle */}
      <div role="tablist" aria-label="Input mode" className="inline-flex items-center bg-surface-muted rounded-lg p-0.5 ring-1 ring-surface-border">
        <ModeButton active={mode === 'paste'} onClick={() => { setMode('paste'); clear() }} icon={ClipboardPaste}>
          Paste rows
        </ModeButton>
        <ModeButton active={mode === 'upload'} onClick={() => { setMode('upload'); clear() }} icon={FileSpreadsheet}>
          Upload CSV / Excel
        </ModeButton>
      </div>

      {mode === 'paste' && (
        <div>
          <label htmlFor="bulk-roster" className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1.5">
            Roster <span className="text-red-500">*</span>
          </label>
          {/* Format reference, lifted out of the placeholder so the admin can
              still see it after they start typing. */}
          <div className="mb-2 rounded-lg border border-surface-border bg-surface-muted/60 px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
            <p className="font-semibold text-ink mb-1">Format — one student per line, pipe-separated:</p>
            <pre className="font-mono text-[11px] text-ink whitespace-pre-wrap break-words">{`Name | Student ID | Class | subject1, subject2, …`}</pre>
            <p className="mt-1.5 font-semibold text-ink">Example:</p>
            <pre className="font-mono text-[11px] text-ink whitespace-pre-wrap break-words">{`Ayomide Ayobami | 2023/mds/023 | JSS 2A | maths, english, chemistry`}</pre>
            <p className="mt-1.5">
              <span className="font-semibold text-ink">Tips:</span> exactly 3 pipes (<span className="font-mono">|</span>) per line · use commas <em>between</em> subjects, not pipes · class and subject names are matched against the existing catalogue (case-insensitive).
            </p>
          </div>
          <textarea
            id="bulk-roster"
            value={text}
            onChange={(e) => { setText(e.target.value); setPreviewed(null); setResults(null) }}
            rows={8}
            placeholder={`Ayomide Ayobami | 2023/mds/023 | JSS 2A | maths, english, chemistry`}
            className="input-brand font-mono text-sm leading-relaxed resize-y"
          />
          <p className="text-xs text-ink-subtle mt-1">
            {liveParsed.length} line{liveParsed.length === 1 ? '' : 's'} parsed
          </p>
        </div>
      )}

      {mode === 'upload' && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1.5">
            Spreadsheet <span className="text-red-500">*</span>
          </label>
          <label className="card flex flex-col items-center justify-center gap-2 px-6 py-8 border-2 border-dashed border-surface-border cursor-pointer hover:border-brand-primary hover:bg-brand-primary-light/30 transition-colors">
            <FileUp className="w-6 h-6 text-ink-muted" />
            <span className="text-sm font-semibold text-ink">
              {uploadName ? `Loaded: ${uploadName}` : 'Click to choose a .csv, .xlsx, or .xls file'}
            </span>
            <span className="text-xs text-ink-subtle text-center max-w-md">
              Expected columns: <span className="font-mono text-ink">Name</span>, <span className="font-mono text-ink">Student ID</span>, <span className="font-mono text-ink">Class</span>, <span className="font-mono text-ink">Subjects</span> (comma-separated).
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
          </label>
          {uploadError && (
            <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 inline-flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" /> {uploadError}
            </div>
          )}
        </div>
      )}

      {mode === 'paste' && (
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
      )}

      {previewed && previewed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-muted border-b border-surface-border text-xs flex-wrap">
            <span className="font-semibold uppercase tracking-wider text-ink-subtle">Preview</span>
            <span className="text-ink-muted">·</span>
            <span className="text-ink-muted">{previewed.length} row{previewed.length === 1 ? '' : 's'}</span>
            {skippedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-brand-secondary-dark font-medium">
                <AlertCircle className="w-3 h-3" /> {skippedCount} will be skipped
              </span>
            )}
            {mode === 'upload' && (
              <button
                type="button"
                onClick={clear}
                className="ml-auto text-xs text-ink-muted hover:text-ink cursor-pointer inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          <ul className="max-h-[28rem] overflow-y-auto divide-y divide-surface-border">
            {previewed.map((row, idx) => {
              const failed = failedNames.has(row.fullName)
              const reason = results?.failed.find((f) => f.fullName === row.fullName)?.reason
              const skipReason = rowSkipReason(row)
              const willSkip = !!skipReason
              return (
                <li
                  key={idx}
                  className={cn(
                    'flex items-start gap-3 px-4 py-2.5',
                    failed && 'bg-red-50/60',
                    !failed && willSkip && 'bg-brand-secondary-light/40',
                  )}
                >
                  <span className="w-12 text-[11px] font-mono text-ink-subtle text-right flex-shrink-0 pt-0.5">
                    {row.lineNumber ? `L${row.lineNumber}` : `#${idx + 1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{row.fullName}</p>
                    <p className="text-xs text-ink-subtle font-mono mt-0.5">
                      {row.studentNumber ?? '—'}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Chip
                        kind={row.classId ? 'ok' : 'bad'}
                        label={row.className ?? 'no class'}
                        title={row.classId ? `matches ${classes.find((c) => c.id === row.classId)?.name}` : 'no matching class'}
                      />
                      {row.subjectIds.map((sid) => {
                        const s = subjects.find((x) => x.id === sid)
                        return <Chip key={sid} kind="ok" label={s?.name ?? '?'} />
                      })}
                      {row.unmatchedSubjects.map((s, i) => {
                        const suggestions = suggestSubjects(s, subjects, 3)
                        return (
                          <span key={`u-${i}`} className="inline-flex items-center gap-1 flex-wrap">
                            <Chip kind="bad" label={s} title="no matching subject" />
                            {suggestions.length > 0 && (
                              <>
                                <span className="text-[10px] text-ink-subtle">→</span>
                                {suggestions.map((sug) => (
                                  <button
                                    key={sug.id}
                                    type="button"
                                    onClick={() => applySubjectFix(idx, s, sug)}
                                    title={`Replace "${s}" with "${sug.name}"`}
                                    className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded font-mono bg-brand-secondary-light text-brand-accent-dark ring-1 ring-brand-secondary/40 hover:bg-brand-secondary hover:text-white cursor-pointer transition-colors"
                                  >
                                    {sug.name}
                                  </button>
                                ))}
                              </>
                            )}
                          </span>
                        )
                      })}
                      {row.subjectIds.length === 0 && row.unmatchedSubjects.length === 0 && (
                        <Chip kind="bad" label="no subjects" />
                      )}
                    </div>
                    {/* Per-row skip explanation — the user shouldn't have to
                        guess why a line won't import. */}
                    {willSkip && !failed && (
                      <p className="mt-1.5 text-[11px] text-brand-secondary-dark inline-flex items-start gap-1">
                        <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span><span className="font-semibold">Skipped:</span> {skipReason}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {failed && reason && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700">
                        <AlertCircle className="w-3.5 h-3.5" /> {reason}
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
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {results && (
        <div className={cn(
          'rounded-xl p-4 border text-sm space-y-2',
          results.failed.length === 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : results.enrolled === 0
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-brand-secondary-light border-brand-secondary/40 text-brand-accent-dark',
        )}>
          <p className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {results.failed.length === 0
              ? `All ${results.enrolled} students enrolled successfully`
              : results.enrolled === 0
                ? `0 enrolled · ${results.failed.length} failed`
                : `${results.enrolled} enrolled · ${results.failed.length} failed`}
          </p>
          {results.failed.length === 0 ? (
            <p className="text-xs">They&apos;ll show up in /admin/students.</p>
          ) : (
            <p className="text-xs">
              {results.enrolled > 0 ? 'Successful rows are saved. ' : ''}
              Fix the highlighted rows in the preview above, remove the ones that already succeeded, then re-submit.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-surface-border">
        {progress.total > 0 && (
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <div className="flex-1 h-1.5 bg-surface-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-300"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-ink-muted whitespace-nowrap">
              {progress.done}/{progress.total}
            </span>
            <span className="text-[11px] font-mono text-emerald-700 whitespace-nowrap">
              ✓ {progress.succeeded}
            </span>
            {progress.failed > 0 && (
              <span className="text-[11px] font-mono text-red-700 whitespace-nowrap">
                ✗ {progress.failed}
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || submittableCount === 0}
          className="btn-brand ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling…</>
          ) : (
            <>Enrol {submittableCount} student{submittableCount === 1 ? '' : 's'}</>
          )}
        </button>
      </div>
    </div>
  )
}

function ModeButton({
  active, onClick, icon: Icon, children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-semibold cursor-pointer transition-colors',
        active ? 'bg-brand-primary text-white shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  )
}

function Chip({ kind, label, title }: { kind: 'ok' | 'bad'; label: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded font-mono',
        kind === 'ok'
          ? 'bg-brand-primary-light text-brand-primary-dark ring-1 ring-brand-primary/20'
          : 'bg-red-50 text-red-700 ring-1 ring-red-200',
      )}
    >
      {label}
    </span>
  )
}
