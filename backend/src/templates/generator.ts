import PDFDocument from 'pdfkit'
import { Writable } from 'stream'
import type { ReportTemplate } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// PDF Generator
//
// Takes resolved report data + a sanitised template and produces a PDF stream.
// Unknown / empty fields are skipped, never errored on.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubjectScore {
  name: string
  ca1: number | null
  ca2: number | null
  exam: number | null
  total: number
  percentage: number
  grade: string
  /** Class average percentage for THIS subject. Filled when settings allow. */
  classAverage: number | null
  /** Highest percentage in the class for THIS subject. Filled when settings allow. */
  classHighest: number | null
  /** Competition rank (1 = top) of THIS student among classmates for THIS subject,
   *  based on the subject's total this term. Null when the student has no score or
   *  class data isn't available. */
  positionInClass: number | null
  /** Prior-term percentages for THIS subject, oldest first. e.g. [First Term: 60]
   *  on a Second-term report. Empty on First-term reports. */
  previousTerms: { term: string; percentage: number | null }[]
}

export interface ReportFieldFlags {
  show_class_average: boolean
  show_class_highest: boolean
  show_position: boolean
  show_previous_terms: boolean
}

export interface BehaviourActivityScore {
  /** Activity name as configured in `behaviour_activities`. */
  name: string
  /** Score for the report's current term, 1–5 or null. */
  current: number | null
  /** Prior-term scores, oldest first. Empty on First-term reports. */
  previousTerms: { term: string; score: number | null }[]
  /** Average across current + prior terms. Null when no data. Only shown on
   *  Second-term + Third-term reports. */
  averageAcrossTerms: number | null
}

export interface ReportData {
  studentName: string
  studentNumber: string | null
  className: string
  classTeacherName: string | null
  term: string
  academicYear: string
  subjects: SubjectScore[]
  overallTotal: number | null
  overallPercentage: number | null
  position: number | null
  timesPresent: number | null
  timesAbsent: number | null
  timesLate: number | null
  behaviourRating: string | null
  teacherRemark: string | null
  principalRemark: string | null
  schoolName: string
  /** Which extension columns to render — admin-controlled. Defaults to all-on. */
  showFields: ReportFieldFlags
  /** Behaviour-activity matrix. Empty when the school has no activities. */
  behaviourActivities: BehaviourActivityScore[]
}

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  ink: '#0F172A',
  muted: '#475569',
  subtle: '#94A3B8',
  brand: '#22C55E',
  border: '#E2E8F0',
  headerBg: '#F8FAFC',
  white: '#FFFFFF',
}

/**
 * Stream a single-student PDF report to an Express Response.
 * The caller sets res.setHeader before calling this.
 */
export function streamReportPDF(
  data: ReportData,
  _template: ReportTemplate, // kept for future custom template support
  res: Writable,
): void {
  const doc = new PDFDocument({ margin: 40, size: 'A4' })
  doc.pipe(res)

  const pageW = doc.page.width - 80 // content width (margin both sides)

  // ── Header ─────────────────────────────────────────────────────────────────
  doc
    .rect(40, 40, pageW, 60)
    .fillColor(C.headerBg)
    .fill()

  doc
    .fillColor(C.ink)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(data.schoolName, 50, 52, { width: pageW - 20, align: 'center' })

  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor(C.muted)
    .text(`${data.term}  ·  ${data.academicYear}  ·  Student Report Sheet`, 50, 72, {
      width: pageW - 20,
      align: 'center',
    })

  doc.moveDown(1.5)

  // ── Student Info table ─────────────────────────────────────────────────────
  const infoRows: [string, string | null][] = [
    ['Student Name', data.studentName],
    ['Student No.', data.studentNumber],
    ['Class', data.className],
    ['Class Teacher', data.classTeacherName],
  ]

  let y = doc.y + 4
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor(C.ink)
    .text('STUDENT INFORMATION', 40, y)
  y += 18
  doc.moveTo(40, y).lineTo(40 + pageW, y).strokeColor(C.brand).lineWidth(1.5).stroke()
  y += 8

  for (const [label, value] of infoRows) {
    if (value === null || value === '') continue
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.muted).text(label, 40, y, { width: 120 })
    doc.fontSize(9).font('Helvetica').fillColor(C.ink).text(value, 165, y)
    y += 16
  }

  // ── Subject Scores table ───────────────────────────────────────────────────
  y += 12
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor(C.ink)
    .text('SUBJECT SCORES', 40, y)
  y += 18
  doc.moveTo(40, y).lineTo(40 + pageW, y).strokeColor(C.brand).lineWidth(1.5).stroke()
  y += 6

  if (data.subjects.length === 0) {
    doc.fontSize(9).font('Helvetica').fillColor(C.subtle).text('No subjects recorded.', 40, y)
    y += 20
  } else {
    // Build column list dynamically. Subject is the wide first column; every
    // other column gets a fixed slim width and the leftover space goes to
    // Subject so totals always fit the page.
    type Col = { header: string; render: (s: SubjectScore) => string; w: number; align: 'left' | 'center' }
    const cols: Col[] = [
      { header: 'Subject',  render: (s) => s.name, w: 0, align: 'left' },
      { header: 'CA1 /20',  render: (s) => s.ca1 !== null ? String(s.ca1) : '—', w: 38, align: 'center' },
      { header: 'CA2 /20',  render: (s) => s.ca2 !== null ? String(s.ca2) : '—', w: 38, align: 'center' },
      { header: 'Exam /60', render: (s) => s.exam !== null ? String(s.exam) : '—', w: 42, align: 'center' },
      { header: 'Total',    render: (s) => String(s.total), w: 36, align: 'center' },
      { header: 'Grade',    render: (s) => s.grade, w: 38, align: 'center' },
    ]
    if (data.showFields.show_class_average) {
      cols.push({ header: 'Cls Avg', render: (s) => s.classAverage !== null ? `${s.classAverage.toFixed(0)}%` : '—', w: 42, align: 'center' })
    }
    if (data.showFields.show_class_highest) {
      cols.push({ header: 'Cls High', render: (s) => s.classHighest !== null ? `${s.classHighest.toFixed(0)}%` : '—', w: 44, align: 'center' })
    }
    if (data.showFields.show_previous_terms) {
      const previousTermColumns = collectPreviousTermColumns(data)
      for (const term of previousTermColumns) {
        cols.push({
          header: shortTerm(term),
          render: (s) => {
            const prev = s.previousTerms.find((p) => p.term === term)
            return prev?.percentage !== null && prev?.percentage !== undefined
              ? `${prev.percentage.toFixed(0)}%`
              : '—'
          },
          w: 42,
          align: 'center',
        })
      }
    }
    // Subject column eats the leftover width.
    const fixedTotal = cols.slice(1).reduce((sum, c) => sum + c.w, 0)
    cols[0].w = Math.max(120, pageW - fixedTotal)

    // Header row
    doc.rect(40, y, pageW, 18).fillColor(C.headerBg).fill()
    let x = 40
    for (const c of cols) {
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(C.muted)
        .text(c.header, x + 4, y + 5, { width: c.w - 4, align: c.align })
      x += c.w
    }
    y += 18

    let rowAlt = false
    for (const subj of data.subjects) {
      if (rowAlt) doc.rect(40, y, pageW, 16).fillColor('#F8FAFC').fill()
      rowAlt = !rowAlt

      x = 40
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i]
        doc
          .fontSize(9)
          .font(i === 0 ? 'Helvetica' : 'Helvetica-Bold')
          .fillColor(C.ink)
          .text(c.render(subj), x + 4, y + 4, { width: c.w - 4, align: c.align })
        x += c.w
      }
      y += 16

      // Page break guard
      if (y > doc.page.height - 120) {
        doc.addPage()
        y = 40
      }
    }
  }

  // ── Overall ────────────────────────────────────────────────────────────────
  if (data.overallTotal !== null || data.overallPercentage !== null) {
    y += 8
    const overallRows: [string, string][] = []
    if (data.overallTotal !== null) overallRows.push(['Total Score', String(data.overallTotal)])
    if (data.overallPercentage !== null) overallRows.push(['Overall %', `${data.overallPercentage.toFixed(1)}%`])
    // Position is gated by report_field_settings.show_position so an admin
    // who's turned the column off won't see a stale row here either.
    if (data.position !== null && data.showFields.show_position) {
      overallRows.push(['Position in Class', `${data.position}`])
    }

    for (const [label, value] of overallRows) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.muted).text(label, 40, y, { width: 120 })
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.ink).text(value, 165, y)
      y += 16
    }
  }

  // ── Behaviour activities ──────────────────────────────────────────────────
  if (data.behaviourActivities.length > 0) {
    y += 12
    // Page-break guard before opening a new section.
    if (y > doc.page.height - 180) {
      doc.addPage()
      y = 40
    }
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.ink).text('BEHAVIOUR', 40, y)
    y += 18
    doc.moveTo(40, y).lineTo(40 + pageW, y).strokeColor(C.brand).lineWidth(1.5).stroke()
    y += 6

    // Collect prior-term columns across the matrix (so we don't add a column
    // for a term with no data anywhere).
    const priorTermsPresent = collectBehaviourPriorTerms(data)
    const showAverage = priorTermsPresent.length > 0 // i.e. ≥ Second Term
    type BCol = { header: string; render: (a: BehaviourActivityScore) => string; w: number; align: 'left' | 'center' }
    const bcols: BCol[] = [
      { header: 'Activity', render: (a) => a.name, w: 0, align: 'left' },
      { header: shortTerm(data.term), render: (a) => fmtScore(a.current), w: 50, align: 'center' },
    ]
    for (const t of priorTermsPresent) {
      bcols.push({
        header: shortTerm(t),
        render: (a) => fmtScore(a.previousTerms.find((p) => p.term === t)?.score ?? null),
        w: 50,
        align: 'center',
      })
    }
    if (showAverage) {
      bcols.push({
        header: 'Avg',
        render: (a) => a.averageAcrossTerms !== null ? a.averageAcrossTerms.toFixed(1) : '—',
        w: 50,
        align: 'center',
      })
    }
    const bFixed = bcols.slice(1).reduce((sum, c) => sum + c.w, 0)
    bcols[0].w = Math.max(180, pageW - bFixed)

    // Header
    doc.rect(40, y, pageW, 18).fillColor(C.headerBg).fill()
    let bx = 40
    for (const c of bcols) {
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(C.muted)
        .text(c.header, bx + 4, y + 5, { width: c.w - 4, align: c.align })
      bx += c.w
    }
    y += 18

    let alt = false
    for (const act of data.behaviourActivities) {
      if (alt) doc.rect(40, y, pageW, 14).fillColor('#F8FAFC').fill()
      alt = !alt
      bx = 40
      for (let i = 0; i < bcols.length; i++) {
        const c = bcols[i]
        doc
          .fontSize(8)
          .font(i === 0 ? 'Helvetica' : 'Helvetica-Bold')
          .fillColor(C.ink)
          .text(c.render(act), bx + 4, y + 3, { width: c.w - 4, align: c.align })
        bx += c.w
      }
      y += 14
      if (y > doc.page.height - 80) {
        doc.addPage()
        y = 40
      }
    }
    // Tiny legend so the meaning of 1–5 is on the page.
    y += 4
    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor(C.subtle)
      .text('Key: 5 = Very Good · 4 = Good · 3 = Fair · 2 = Weak · 1 = Poor', 40, y, { width: pageW })
    y += 12
  }

  // ── Attendance ─────────────────────────────────────────────────────────────
  const hasAttendance =
    data.timesPresent !== null || data.timesAbsent !== null || data.timesLate !== null
  if (hasAttendance) {
    y += 12
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.ink).text('ATTENDANCE', 40, y)
    y += 18
    doc.moveTo(40, y).lineTo(40 + pageW, y).strokeColor(C.brand).lineWidth(1.5).stroke()
    y += 8

    const attRows: [string, number | null][] = [
      ['Times Present', data.timesPresent],
      ['Times Absent', data.timesAbsent],
      ['Times Late', data.timesLate],
    ]
    for (const [label, val] of attRows) {
      if (val === null) continue
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.muted).text(label, 40, y, { width: 120 })
      doc.fontSize(9).font('Helvetica').fillColor(C.ink).text(String(val), 165, y)
      y += 16
    }
  }

  // ── Remarks ────────────────────────────────────────────────────────────────
  const hasRemarks =
    data.behaviourRating || data.teacherRemark || data.principalRemark
  if (hasRemarks) {
    y += 12
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.ink).text('REMARKS', 40, y)
    y += 18
    doc.moveTo(40, y).lineTo(40 + pageW, y).strokeColor(C.brand).lineWidth(1.5).stroke()
    y += 8

    if (data.behaviourRating) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.muted).text('Behaviour', 40, y, { width: 120 })
      doc.fontSize(9).font('Helvetica').fillColor(C.ink).text(data.behaviourRating, 165, y)
      y += 16
    }
    if (data.teacherRemark) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.muted).text("Class Teacher's Remark", 40, y, { width: 120 })
      const remarkH = doc.heightOfString(data.teacherRemark, { width: pageW - 130 })
      doc.fontSize(9).font('Helvetica').fillColor(C.ink).text(data.teacherRemark, 165, y, { width: pageW - 130 })
      y += Math.max(16, remarkH + 4)
    }
    if (data.principalRemark) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.muted).text("Principal's Remark", 40, y, { width: 120 })
      const remarkH = doc.heightOfString(data.principalRemark, { width: pageW - 130 })
      doc.fontSize(9).font('Helvetica').fillColor(C.ink).text(data.principalRemark, 165, y, { width: pageW - 130 })
      y += Math.max(16, remarkH + 4)
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 50
  doc
    .moveTo(40, footerY)
    .lineTo(40 + pageW, footerY)
    .strokeColor(C.border)
    .lineWidth(0.5)
    .stroke()
  doc
    .fontSize(7)
    .font('Helvetica')
    .fillColor(C.subtle)
    .text(
      `Generated by Academia  ·  ${new Date().toLocaleDateString('en-GB')}`,
      40,
      footerY + 6,
      { width: pageW, align: 'center' },
    )

  doc.end()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Collect every prior-term name that appears in this data set, in
 * chronological order (First → Second). Used to derive the prev-term column
 * count so we don't render columns for terms with no data.
 */
function collectPreviousTermColumns(data: ReportData): string[] {
  const order = ['First Term', 'Second Term', 'Third Term']
  const present = new Set<string>()
  for (const subj of data.subjects) {
    for (const p of subj.previousTerms) {
      if (p.percentage !== null) present.add(p.term)
    }
  }
  return order.filter((t) => present.has(t))
}

/**
 * Same idea for the behaviour matrix — only render prev-term columns where
 * at least one activity has a score in that term.
 */
function collectBehaviourPriorTerms(data: ReportData): string[] {
  const order = ['First Term', 'Second Term', 'Third Term']
  const present = new Set<string>()
  for (const act of data.behaviourActivities) {
    for (const p of act.previousTerms) {
      if (p.score !== null) present.add(p.term)
    }
  }
  return order.filter((t) => present.has(t))
}

function fmtScore(score: number | null): string {
  return score === null ? '—' : String(score)
}

/** Compact label for prev-term columns. "First Term" → "1st". */
function shortTerm(term: string): string {
  if (term.startsWith('First')) return '1st T'
  if (term.startsWith('Second')) return '2nd T'
  if (term.startsWith('Third')) return '3rd T'
  return term
}
