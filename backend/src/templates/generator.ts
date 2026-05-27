import PDFDocument from 'pdfkit'
import type { Response } from 'express'
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
  res: Response,
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
    // Column widths
    const colW = [180, 45, 45, 45, 45, 45] as const
    const headers = ['Subject', 'CA1 /20', 'CA2 /20', 'Exam /60', 'Total', 'Grade']

    // Header row
    doc.rect(40, y, pageW, 18).fillColor(C.headerBg).fill()
    let x = 40
    headers.forEach((h, i) => {
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(C.muted)
        .text(h, x + 4, y + 5, { width: colW[i], align: i === 0 ? 'left' : 'center' })
      x += colW[i]
    })
    y += 18

    let rowAlt = false
    for (const subj of data.subjects) {
      if (rowAlt) doc.rect(40, y, pageW, 16).fillColor('#F8FAFC').fill()
      rowAlt = !rowAlt

      const cells = [
        subj.name,
        subj.ca1 !== null ? String(subj.ca1) : '—',
        subj.ca2 !== null ? String(subj.ca2) : '—',
        subj.exam !== null ? String(subj.exam) : '—',
        String(subj.total),
        subj.grade,
      ]
      x = 40
      cells.forEach((cell, i) => {
        doc
          .fontSize(9)
          .font(i === 0 ? 'Helvetica' : 'Helvetica-Bold')
          .fillColor(C.ink)
          .text(cell, x + 4, y + 4, { width: colW[i], align: i === 0 ? 'left' : 'center' })
        x += colW[i]
      })
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
    if (data.overallPercentage !== null) overallRows.push(['Class Average', `${data.overallPercentage.toFixed(1)}%`])
    if (data.position !== null) overallRows.push(['Position in Class', `${data.position}`])

    for (const [label, value] of overallRows) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.muted).text(label, 40, y, { width: 120 })
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.ink).text(value, 165, y)
      y += 16
    }
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
