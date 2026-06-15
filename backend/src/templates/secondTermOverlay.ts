import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { ReportData, SubjectScore, BehaviourActivityScore } from './generator'

// ─────────────────────────────────────────────────────────────────────────────
// Second-Term report renderer
//
// Overlays a student's real data onto the fixed "MY DREAM COLLEGE" Second-Term
// report sheet (report_sheet_template.pdf — a single full-page image, no text
// layer). Coordinates were derived from the template image by grid-line
// detection; see docs/second-term-report-template.md. Pixel space (top-left
// origin, 2012×2936) is converted to PDF points (bottom-left origin).
//
// Anything without a data source (Sex, teacher's sign, School Fees, Next Term
// Commences, Days School Open) is left blank — the printed line shows through.
// Subjects/activities the student doesn't have are left blank too.
// ─────────────────────────────────────────────────────────────────────────────

const IMG_W = 2012
const IMG_H = 2936
const PT_W = 594.3
const PT_H = 840.51
const SX = PT_W / IMG_W
const SY = PT_H / IMG_H

const px2x = (px: number) => px * SX
const px2y = (py: number) => PT_H - py * SY // flip Y (px from top → pt from bottom)
const pt = (pxSize: number) => pxSize * SY // font size px → pt

const INK = rgb(0.1, 0.12, 0.1)

// Printed row order on the sheet — maps each printed row to a catalogue name.
const PRINTED_SUBJECTS = [
  'Mathematics', 'English Language', 'Physics', 'Chemistry', 'Biology', 'Economics',
  'Financial Accounting', 'Yoruba', 'Commerce', 'Further Mathematics', 'Marketing',
  'Literature in English', 'Government', 'Civic Education', 'Christian Religious Studies',
  'Agricultural Science',
]
const PRINTED_ACTIVITIES = [
  'Punctuality', 'Class Attendance', 'Carrying of Assignment', 'Neatness', 'Politeness',
  'Relationship with Staff', 'Relationship with Students', 'Attentiveness', 'Initiative',
  'Emotional Stability', 'Attitude to Study', 'Attitude to Property', 'Clubs & Societies',
  'Games & Sports', 'Manual Skill', 'Handwriting',
]

// Coordinates in image pixels (top-left origin). Baselines for text rows.
const HEADER = {
  year:          { x: 1095, y: 620 },
  name:          { x: 165,  y: 732, w: 280 },
  regNo:         { x: 1195, y: 732, w: 255 },
  className:     { x: 185,  y: 874, w: 250 },
  totalScore:    { x: 1555, y: 874, w: 300 },
  numberInClass: { x: 470,  y: 1015, w: 230 },
  percentage:    { x: 1190, y: 1015, w: 150 },
  classPosition: { x: 1648, y: 1015, w: 230 },
}
// Part A: row baselines (16) + numeric column centers (9): CA1,CA2,Exam,Total,
// ClsAvg,ClsHigh,Grade,Position,1stTerm.
const A_ROWS = [1267, 1318, 1370, 1421, 1473, 1524, 1575, 1627, 1679, 1731, 1782, 1834, 1886, 1938, 1989, 2042]
const A_COLS = [395, 489, 586, 680, 775, 872, 968, 1067, 1166]
// Part B: row baselines (16) + column centers (3): 1stTerm, 2ndTerm, Avg.
const B_ROWS = [1288, 1346, 1406, 1463, 1515, 1570, 1630, 1688, 1743, 1801, 1861, 1920, 1975, 2030, 2088, 2145]
const B_COLS = [1758, 1853, 1944]
const FOOTER = {
  daysPresent: { x: 490,  y: 2562, w: 540 },
  daysAbsent:  { x: 1700, y: 2562, w: 220 },
  formMaster:  { x: 510,  y: 2650, w: 1380 },
  headTeacher: { x: 525,  y: 2840, w: 1380 },
}

const ROW_TEXT_PX = 22
const HEADER_TEXT_PX = 26
const COMMENT_TEXT_PX = 24
const MIN_PX = 12 // auto-fit floor

let templateCache: Buffer | null = null
function loadTemplate(): Buffer {
  if (templateCache) return templateCache
  const candidates = [
    path.join(__dirname, 'report_sheet_template.pdf'), // dist (if asset copied)
    path.join(__dirname, '..', '..', 'src', 'templates', 'report_sheet_template.pdf'), // dev + source deploys
    path.join(process.cwd(), 'src', 'templates', 'report_sheet_template.pdf'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      templateCache = fs.readFileSync(p)
      return templateCache
    }
  }
  throw new Error('Second-Term template PDF not found in: ' + candidates.join(', '))
}

const fmt = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v)
const round = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(Math.round(v))

/** Largest font size (px) at which `text` fits `maxWpx`, down to MIN_PX. */
function fitSize(font: PDFFont, text: string, basePx: number, maxWpx: number): number {
  let size = basePx
  while (size > MIN_PX && font.widthOfTextAtSize(text, pt(size)) > px2x(maxWpx)) size -= 1
  return size
}

function drawLeft(page: PDFPage, font: PDFFont, text: string, xpx: number, ypx: number, basePx: number, maxWpx?: number) {
  if (!text) return
  const px = maxWpx ? fitSize(font, text, basePx, maxWpx) : basePx
  page.drawText(text, { x: px2x(xpx), y: px2y(ypx), size: pt(px), font, color: INK })
}
function drawCenter(page: PDFPage, font: PDFFont, text: string, cxpx: number, ypx: number, basePx: number) {
  if (!text) return
  const w = font.widthOfTextAtSize(text, pt(basePx))
  page.drawText(text, { x: px2x(cxpx) - w / 2, y: px2y(ypx), size: pt(basePx), font, color: INK })
}

const norm = (s: string) => s.trim().toLowerCase()

/** First-term percentage for a subject (the report's only prior term). */
function firstTermPct(s: SubjectScore): string {
  const ft = s.previousTerms.find((p) => p.term === 'First Term')
  return round(ft?.percentage ?? null)
}
function firstTermBehaviour(a: BehaviourActivityScore): string {
  const ft = a.previousTerms.find((p) => p.term === 'First Term')
  return fmt(ft?.score ?? null)
}

/** Render the Second-Term report and return the PDF bytes. */
export async function renderSecondTermPDF(data: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.load(loadTemplate())
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.getPages()[0]

  // ── Header ──
  const endYear = data.academicYear.split('/')[1] // "2025/2026" → "2026"
  drawLeft(page, font, endYear ? endYear.slice(-2) : '', HEADER.year.x, HEADER.year.y, 28)
  drawLeft(page, font, data.studentName, HEADER.name.x, HEADER.name.y, HEADER_TEXT_PX, HEADER.name.w)
  drawLeft(page, font, data.studentNumber ?? '', HEADER.regNo.x, HEADER.regNo.y, HEADER_TEXT_PX, HEADER.regNo.w)
  drawLeft(page, font, data.className, HEADER.className.x, HEADER.className.y, HEADER_TEXT_PX, HEADER.className.w)
  drawLeft(page, font, round(data.overallTotal), HEADER.totalScore.x, HEADER.totalScore.y, HEADER_TEXT_PX, HEADER.totalScore.w)
  drawLeft(page, font, fmt(data.classSize ?? null), HEADER.numberInClass.x, HEADER.numberInClass.y, HEADER_TEXT_PX, HEADER.numberInClass.w)
  drawLeft(page, font, round(data.overallPercentage), HEADER.percentage.x, HEADER.percentage.y, HEADER_TEXT_PX, HEADER.percentage.w)
  drawLeft(page, font, data.position !== null ? String(data.position) : '', HEADER.classPosition.x, HEADER.classPosition.y, HEADER_TEXT_PX, HEADER.classPosition.w)

  // ── Part A: subjects, matched by name to printed rows ──
  const subjByName = new Map(data.subjects.map((s) => [norm(s.name), s]))
  PRINTED_SUBJECTS.forEach((printed, i) => {
    const s = subjByName.get(norm(printed))
    if (!s) return // student doesn't offer this subject → blank row
    const y = A_ROWS[i]
    const cells = [
      fmt(s.ca1), fmt(s.ca2), fmt(s.exam), fmt(s.total),
      round(s.classAverage), round(s.classHighest), s.grade,
      s.positionInClass !== null ? String(s.positionInClass) : '',
      firstTermPct(s),
    ]
    cells.forEach((c, ci) => drawCenter(page, font, c, A_COLS[ci], y, ROW_TEXT_PX))
  })

  // ── Part B: behaviour, matched by name to printed rows ──
  const actByName = new Map(data.behaviourActivities.map((a) => [norm(a.name), a]))
  PRINTED_ACTIVITIES.forEach((printed, i) => {
    const a = actByName.get(norm(printed))
    if (!a) return
    const y = B_ROWS[i]
    drawCenter(page, font, firstTermBehaviour(a), B_COLS[0], y, ROW_TEXT_PX)
    drawCenter(page, font, fmt(a.current), B_COLS[1], y, ROW_TEXT_PX)
    drawCenter(page, font, a.averageAcrossTerms !== null ? a.averageAcrossTerms.toFixed(1) : '', B_COLS[2], y, ROW_TEXT_PX)
  })

  // ── Footer ──
  drawLeft(page, font, fmt(data.timesPresent), FOOTER.daysPresent.x, FOOTER.daysPresent.y, HEADER_TEXT_PX, FOOTER.daysPresent.w)
  drawLeft(page, font, fmt(data.timesAbsent), FOOTER.daysAbsent.x, FOOTER.daysAbsent.y, HEADER_TEXT_PX, FOOTER.daysAbsent.w)
  drawLeft(page, font, data.teacherRemark ?? '', FOOTER.formMaster.x, FOOTER.formMaster.y, COMMENT_TEXT_PX, FOOTER.formMaster.w)
  drawLeft(page, font, data.principalRemark ?? '', FOOTER.headTeacher.x, FOOTER.headTeacher.y, COMMENT_TEXT_PX, FOOTER.headTeacher.w)

  return doc.save()
}

/** Buffer variant for the bulk ZIP path. */
export async function secondTermReportBuffer(data: ReportData): Promise<Buffer> {
  return Buffer.from(await renderSecondTermPDF(data))
}
