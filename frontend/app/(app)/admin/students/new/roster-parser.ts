// Shared parser/matcher used by both the paste textarea and the CSV/Excel
// uploader on /admin/students/new. Pure functions, safe to call from a server
// or client component.

export interface RosterInputRow {
  fullName: string
  studentNumber: string | null
  className: string | null
  subjectsRaw: string[]
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
// Accepts pipe-delimited rows: `Name | StudentID | Class | subject1, subject2, …`
// Falls back to 2-column legacy format (`Name | StudentID`) — those rows land
// without a class/subjects and get flagged in the preview.
export function parsePastedRoster(text: string): RosterInputRow[] {
  const rows: RosterInputRow[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const cells = line.split('|').map((c) => c.trim())
    const fullName = cells[0] ?? ''
    const studentNumber = (cells[1] && cells[1].length > 0) ? cells[1] : null
    const className = (cells[2] && cells[2].length > 0) ? cells[2] : null
    const subjectsRaw = cells[3]
      ? cells[3].split(',').map((s) => s.trim()).filter(Boolean)
      : []
    if (!fullName) continue
    rows.push({ fullName, studentNumber, className, subjectsRaw })
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
  for (const row of rows) {
    const fullName = (row[nameIdx] ?? '').toString().trim()
    if (!fullName) continue
    const studentNumber = numIdx >= 0 && row[numIdx] ? row[numIdx].toString().trim() || null : null
    const className = classIdx >= 0 && row[classIdx] ? row[classIdx].toString().trim() || null : null
    const subjCell = subjIdx >= 0 && row[subjIdx] ? row[subjIdx].toString() : ''
    const subjectsRaw = subjCell.split(',').map((s) => s.trim()).filter(Boolean)
    out.push({ fullName, studentNumber, className, subjectsRaw })
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
    }
  })
}

export function rowHasError(r: ResolvedRow): boolean {
  return !r.classId || r.subjectIds.length === 0 || r.unmatchedSubjects.length > 0 || !!r.unmatchedClass
}

export function rowIsSubmittable(r: ResolvedRow): boolean {
  // Allow rows with partial subject matches as long as at least one matched and
  // there's a class. Unmatched subjects are warnings, not blockers — the admin
  // can drop the row from the preview if they want strict matching.
  return !!r.classId && r.subjectIds.length > 0
}
