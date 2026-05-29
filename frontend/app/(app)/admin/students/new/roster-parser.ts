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

// Strip a trailing 's' so "maths" matches "mathematics" — the user paste case
// that triggered this. Length-3 minimum so "is", "us" etc. don't get mangled.
function stripPluralS(s: string): string {
  return s.length > 3 && s.endsWith('s') ? s.slice(0, -1) : s
}

/**
 * Fuzzy-match a free-text subject name against the catalogue. Strategy:
 *   1. Exact normalize match (already what buildIndex did).
 *   2. Prefix match either way after stripping trailing 's' — so "maths" finds
 *      "Mathematics", "eng" finds "English", "chem" finds "Chemistry".
 *   3. Among multiple prefix hits, pick the catalogue entry with the SHORTEST
 *      name to bias toward "Mathematics" over "Further Mathematics" when the
 *      user types "math".
 *
 * Returns null when no candidate matches. The single-character / 2-letter
 * floor in step 2 prevents nonsense input from matching the first subject
 * starting with that letter.
 */
export function findSubjectIdFuzzy(input: string, subjects: { id: string; name: string }[]): string | null {
  const inp = normalize(input)
  if (!inp) return null
  // Exact match.
  for (const s of subjects) {
    if (normalize(s.name) === inp) return s.id
  }
  const inpS = stripPluralS(inp)
  if (inpS.length < 3) return null
  let best: { id: string; len: number } | null = null
  for (const s of subjects) {
    const name = normalize(s.name)
    const nameS = stripPluralS(name)
    if (nameS.startsWith(inpS) || inpS.startsWith(nameS)) {
      if (!best || name.length < best.len) best = { id: s.id, len: name.length }
    }
  }
  return best?.id ?? null
}

/**
 * Looser variant for autocomplete suggestion lists. Returns matches ranked by
 * prefix-vs-substring and shortest-name tiebreak, capped at `limit`.
 */
export function suggestSubjects(
  input: string,
  subjects: { id: string; name: string }[],
  limit = 6,
): { id: string; name: string }[] {
  const inp = normalize(input)
  if (!inp) return []
  const inpS = stripPluralS(inp)
  const scored: { s: { id: string; name: string }; score: number }[] = []
  for (const s of subjects) {
    const name = normalize(s.name)
    const nameS = stripPluralS(name)
    let score = -1
    if (name === inp) score = 1000
    else if (nameS.startsWith(inpS)) score = 500 - name.length
    else if (inpS.startsWith(nameS)) score = 400 - name.length
    else if (name.includes(inpS)) score = 200 - name.length
    if (score > 0) scored.push({ s, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((x) => x.s)
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

  return rows.map((r) => {
    const classId = r.className ? classIdx.get(normalize(r.className)) ?? null : null
    const subjectIds: string[] = []
    const unmatchedSubjects: string[] = []
    const seen = new Set<string>()
    for (const s of r.subjectsRaw) {
      // Exact + fuzzy (prefix / trailing-s) match so "maths" → Mathematics,
      // "eng" → English. Falls through to unmatched when nothing scores.
      const id = findSubjectIdFuzzy(s, cat.subjects)
      if (id) {
        if (!seen.has(id)) {
          subjectIds.push(id)
          seen.add(id)
        }
      } else {
        unmatchedSubjects.push(s)
      }
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
  // Strict matching: block the row if any subject didn't resolve to a
  // catalogue entry. Silently discarding unmatched subjects was masking
  // mistakes the admin couldn't see in /admin/students afterwards.
  return (
    !r.parseError
    && !!r.classId
    && r.subjectIds.length > 0
    && r.unmatchedSubjects.length === 0
  )
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
  } else if (r.unmatchedSubjects.length > 0) {
    reasons.push(
      `subject${r.unmatchedSubjects.length === 1 ? '' : 's'} not in catalogue: ${r.unmatchedSubjects.join(', ')}`,
    )
  }
  return reasons.join('; ') || 'row is incomplete'
}
