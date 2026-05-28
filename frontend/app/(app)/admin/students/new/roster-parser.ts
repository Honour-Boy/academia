// Shared parser/matcher used by both the paste textarea and the CSV/Excel
// uploader on /admin/students/new. Pure functions, safe to call from a server
// or client component.

export interface RosterInputRow {
  fullName: string
  studentNumber: string | null
  className: string | null
  subjectsRaw: string[]
  /** Original line number from the paste (1-indexed). Useful for error messages. */
  lineNumber?: number
  /** Parse-time issue: e.g. missing pipes, extra cells. */
  parseError?: string
}

export interface ResolvedRow {
  fullName: string
  studentNumber: string | null
  className: string | null
  classId: string | null
  subjectsRaw: string[]
  subjectIds: string[]
  unmatchedClass: string | null
  unmatchedSubjects: string[]
  lineNumber?: number
  parseError?: string
}

export interface Catalogue {
  classes: { id: string; name: string }[]
  subjects: { id: string; name: string }[]
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function buildIndex(rows: { id: string; name: string }[]): Map<string, string> {
  const idx = new Map<string, string>()
  for (const r of rows) idx.set(normalize(r.name), r.id)
  return idx
}

// ── Paste parsing ─────────────────────────────────────────────────────────────
// Expected format per line (pipe-delimited):
//   Name | Student ID | Class | subject1, subject2, …
// Older 2-column rows (Name | Student ID) are still parsed but get a parseError
// so the admin sees exactly why they can't be submitted.
export function parsePastedRoster(text: string): RosterInputRow[] {
  const rows: RosterInputRow[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) continue
    const lineNumber = i + 1

    // Surface a clear error when the line wasn't pipe-delimited at all — that's
    // the #1 cause of confusing "skipped" warnings from earlier versions.
    if (!line.includes('|')) {
      rows.push({
        fullName: line,
        studentNumber: null,
        className: null,
        subjectsRaw: [],
        lineNumber,
        parseError:
          'No pipe (|) characters found — expected: Name | Student ID | Class | subject1, subject2',
      })
      continue
    }

    const cells = line.split('|').map((c) => c.trim())
    const fullName = cells[0] ?? ''
    const studentNumber = (cells[1] && cells[1].length > 0) ? cells[1] : null
    const className = (cells[2] && cells[2].length > 0) ? cells[2] : null
    const subjectsRaw = cells[3]
      ? cells[3].split(',').map((s) => s.trim()).filter(Boolean)
      : []

    if (!fullName) {
      rows.push({
        fullName: `(line ${lineNumber})`,
        studentNumber: null,
        className: null,
        subjectsRaw: [],
        lineNumber,
        parseError: 'Name (the first cell before the first |) is empty',
      })
      continue
    }

    let parseError: string | undefined
    if (cells.length < 4) {
      // Tell the admin exactly which cell is missing.
      const missing: string[] = []
      if (cells.length < 3) missing.push('Class')
      if (cells.length < 4) missing.push('Subjects')
      parseError = `Missing ${missing.join(' and ')} — only ${cells.length} cell${cells.length === 1 ? '' : 's'} found (expected 4: Name | Student ID | Class | Subjects)`
    } else if (cells.length > 4) {
      // Extra pipes inside a name or subject list are a common source of bad
      // rows ("Mr. Smith | 001 | JSS 1A | maths | english" — the user meant
      // commas between subjects).
      parseError = `Too many cells (${cells.length}) — found ${cells.length - 1} | characters but only 3 are expected. Did you use | between subjects instead of commas?`
    }

    rows.push({ fullName, studentNumber, className, subjectsRaw, lineNumber, parseError })
  }
  return rows
}

// ── Spreadsheet rows → RosterInputRow ─────────────────────────────────────────
// `headers` is the header row from CSV/Excel parse; `rows` are the data rows.
// We accept loose header naming (case-insensitive, ignore punctuation/spaces).
export function fromSpreadsheetRows(headers: string[], rows: string[][]): RosterInputRow[] {
  const normalizedHeaders = headers.map(normalize)
  const find = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = normalizedHeaders.indexOf(normalize(c))
      if (i >= 0) return i
    }
    return -1
  }
  const nameIdx = find('name', 'fullname', 'student', 'studentname')
  const numIdx = find('studentid', 'studentnumber', 'id', 'number', 'admissionno', 'admno')
  const classIdx = find('class', 'classname', 'classroom', 'arm')
  const subjIdx = find('subjects', 'subject', 'offerings', 'offers')

  if (nameIdx < 0) return []

  const out: RosterInputRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const fullName = (row[nameIdx] ?? '').toString().trim()
    if (!fullName) continue
    const studentNumber = numIdx >= 0 && row[numIdx] ? row[numIdx].toString().trim() || null : null
    const className = classIdx >= 0 && row[classIdx] ? row[classIdx].toString().trim() || null : null
    const subjCell = subjIdx >= 0 && row[subjIdx] ? row[subjIdx].toString() : ''
    const subjectsRaw = subjCell.split(',').map((s) => s.trim()).filter(Boolean)
    // Row 1 is the header; sheet line numbers start at 2 for the first data row.
    out.push({ fullName, studentNumber, className, subjectsRaw, lineNumber: i + 2 })
  }
  return out
}

// ── Resolution against catalogue ──────────────────────────────────────────────
export function resolveRows(rows: RosterInputRow[], cat: Catalogue): ResolvedRow[] {
  const classIdx = buildIndex(cat.classes)
  const subjectIdx = buildIndex(cat.subjects)

  return rows.map((r) => {
    const classId = r.className ? classIdx.get(normalize(r.className)) ?? null : null
    const subjectIds: string[] = []
    const unmatchedSubjects: string[] = []
    for (const s of r.subjectsRaw) {
      const id = subjectIdx.get(normalize(s))
      if (id) subjectIds.push(id)
      else unmatchedSubjects.push(s)
    }
    return {
      fullName: r.fullName,
      studentNumber: r.studentNumber,
      className: r.className,
      classId,
      subjectsRaw: r.subjectsRaw,
      subjectIds,
      unmatchedClass: r.className && !classId ? r.className : null,
      unmatchedSubjects,
      lineNumber: r.lineNumber,
      parseError: r.parseError,
    }
  })
}

export function rowHasError(r: ResolvedRow): boolean {
  return !!r.parseError || !r.classId || r.subjectIds.length === 0 || r.unmatchedSubjects.length > 0 || !!r.unmatchedClass
}

export function rowIsSubmittable(r: ResolvedRow): boolean {
  // Allow rows with partial subject matches as long as at least one matched and
  // there's a class. Unmatched subjects are warnings, not blockers — the admin
  // can drop the row from the preview if they want strict matching.
  return !r.parseError && !!r.classId && r.subjectIds.length > 0
}

/**
 * Plain-English explanation of why a row won't be submitted. Returns null if
 * the row is submittable. Designed for the per-row tooltip in the preview, so
 * the admin never has to guess what "skipped" means.
 */
export function rowSkipReason(r: ResolvedRow): string | null {
  if (rowIsSubmittable(r)) return null
  if (r.parseError) return r.parseError
  const reasons: string[] = []
  if (!r.className) {
    reasons.push('class is empty (3rd cell)')
  } else if (!r.classId) {
    reasons.push(`class "${r.className}" doesn't match any existing class`)
  }
  if (r.subjectsRaw.length === 0) {
    reasons.push('no subjects listed (4th cell, comma-separated)')
  } else if (r.subjectIds.length === 0) {
    reasons.push(
      `none of the subjects matched the catalogue (${r.subjectsRaw.join(', ')})`,
    )
  }
  return reasons.join('; ') || 'row is incomplete'
}
