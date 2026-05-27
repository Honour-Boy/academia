import { Router } from 'express'
import archiver from 'archiver'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth'
import { requireRole } from '../middleware/requireRole'
import { adminClient } from '../lib/supabase'
import { defaultTemplate } from '../templates/parser'
import { streamReportPDF, type ReportData, type SubjectScore } from '../templates/generator'

export const reportsRouter = Router()

reportsRouter.use(requireAuth, requireRole(['ADMIN']))

const SCHOOL_NAME = process.env.SCHOOL_NAME ?? 'Your School'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
}

/** Build the full ReportData for a single student + term/year. */
async function buildReportData(
  studentId: string,
  term: string,
  academicYear: string,
): Promise<ReportData | null> {
  const [
    { data: student },
    { data: studentSubjects },
    { data: remark },
    { data: components },
  ] = await Promise.all([
    adminClient
      .from('students')
      .select('*, classes(id, name, level, arm)')
      .eq('id', studentId)
      .single(),
    adminClient
      .from('student_subjects')
      .select('subject_id, subjects(id, name)')
      .eq('student_id', studentId),
    adminClient
      .from('student_remarks')
      .select('*')
      .eq('student_id', studentId)
      .eq('term', term)
      .eq('academic_year', academicYear)
      .maybeSingle(),
    adminClient
      .from('score_components')
      .select('*')
      .order('sort_order'),
  ])

  if (!student) return null

  const classData = (student as any).classes as {
    id: string; name: string; level: string; arm: string
  } | null

  // Get class teacher
  let classTeacherName: string | null = null
  if (classData) {
    const { data: cta } = await adminClient
      .from('class_teacher_assignments')
      .select('profiles!teacher_id(full_name)')
      .eq('class_id', classData.id)
      .eq('term', term)
      .eq('academic_year', academicYear)
      .maybeSingle()

    classTeacherName =
      (cta as any)?.profiles?.full_name ?? null
  }

  // Fetch grades for all subjects
  const subjectIds = (studentSubjects ?? []).map((ss: any) => ss.subject_id)
  const { data: grades } = subjectIds.length > 0
    ? await adminClient
        .from('grades')
        .select('*')
        .eq('student_id', studentId)
        .eq('term', term)
        .eq('academic_year', academicYear)
        .in('subject_id', subjectIds)
    : { data: [] }

  // Map components by id
  const compMap: Record<string, any> = {}
  for (const c of components ?? []) compMap[c.id] = c

  // Build per-subject score rows
  const subjectScores: SubjectScore[] = []
  for (const ss of studentSubjects ?? []) {
    const subj = (ss as any).subjects as { id: string; name: string }
    if (!subj) continue

    const subjGrades = (grades ?? []).filter((g: any) => g.subject_id === subj.id)
    let ca1: number | null = null
    let ca2: number | null = null
    let exam: number | null = null
    let total = 0

    for (const g of subjGrades) {
      const comp = compMap[g.component_id]
      if (!comp) continue
      const name = comp.name.toLowerCase()
      if (name.includes('ca 1') || name.includes('ca1')) ca1 = g.score
      else if (name.includes('ca 2') || name.includes('ca2')) ca2 = g.score
      else if (name.includes('exam')) exam = g.score
      if (g.score !== null) total += g.score
    }

    const percentage = Math.min(100, total)
    subjectScores.push({
      name: subj.name,
      ca1,
      ca2,
      exam,
      total,
      percentage,
      grade: percentageToGrade(percentage),
    })
  }

  const overallTotal =
    subjectScores.length > 0
      ? subjectScores.reduce((s, r) => s + r.total, 0)
      : null
  const overallPercentage =
    subjectScores.length > 0
      ? Math.round(subjectScores.reduce((s, r) => s + r.percentage, 0) / subjectScores.length)
      : null

  return {
    studentName: student.full_name,
    studentNumber: student.student_number ?? null,
    className: classData?.name ?? '',
    classTeacherName,
    term,
    academicYear,
    subjects: subjectScores,
    overallTotal,
    overallPercentage,
    position: null, // computed at bulk level
    timesPresent: remark?.times_present ?? null,
    timesAbsent: remark?.times_absent ?? null,
    timesLate: remark?.times_late ?? null,
    behaviourRating: remark?.behaviour_rating ?? null,
    teacherRemark: remark?.teacher_remark ?? null,
    principalRemark: remark?.principal_remark ?? null,
    schoolName: SCHOOL_NAME,
  }
}

function percentageToGrade(p: number): string {
  if (p >= 75) return 'A1'
  if (p >= 70) return 'B2'
  if (p >= 65) return 'B3'
  if (p >= 60) return 'C4'
  if (p >= 55) return 'C5'
  if (p >= 50) return 'C6'
  if (p >= 45) return 'D7'
  if (p >= 40) return 'E8'
  return 'F9'
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /reports/student/:id?term=&year=
 * Streams a single student's PDF report.
 */
reportsRouter.get('/student/:id', async (req, res) => {
  const term = (req.query.term as string) ?? 'First Term'
  const year = (req.query.year as string) ?? '2025/2026'

  const reportData = await buildReportData(req.params.id, term, year)
  if (!reportData) {
    res.status(404).json({ error: 'Student not found' })
    return
  }

  const filename = `${slugify(reportData.studentName)}_Report_Sheet.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  streamReportPDF(reportData, defaultTemplate(), res)
})

/**
 * POST /reports/bulk
 * Body: { studentIds: string[], term: string, academicYear: string }
 * Returns a ZIP of all student PDFs.
 */
const bulkBody = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(100),
  term: z.string().min(1),
  academicYear: z.string().min(1),
})

reportsRouter.post('/bulk', async (req, res) => {
  const parsed = bulkBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' })
    return
  }

  const { studentIds, term, academicYear } = parsed.data

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="report_sheets_${slugify(term)}_${slugify(academicYear)}.zip"`,
  )

  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.pipe(res)

  archive.on('error', (err) => {
    console.error('Archiver error:', err)
    // Can't change headers at this point — just end
    res.end()
  })

  const template = defaultTemplate()

  // Build each report and append to the ZIP
  for (const studentId of studentIds) {
    const data = await buildReportData(studentId, term, academicYear)
    if (!data) continue

    const filename = `${slugify(data.studentName)}_Report_Sheet.pdf`

    // Collect the PDF into a buffer then append
    const pdfBuffer = await pdfToBuffer(data, template)
    archive.append(pdfBuffer, { name: filename })
  }

  await archive.finalize()
})

/** Helper: render PDF to Buffer using pdfkit */
function pdfToBuffer(data: ReportData, template: ReturnType<typeof defaultTemplate>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    // Create a mock response-like object to collect the stream
    const fakeRes = {
      write: (chunk: Buffer) => { chunks.push(chunk); return true },
      end: (chunk?: Buffer) => {
        if (chunk) chunks.push(chunk)
        resolve(Buffer.concat(chunks))
      },
      on: () => fakeRes,
      once: () => fakeRes,
      emit: () => false,
      removeListener: () => fakeRes,
    } as any

    try {
      streamReportPDF(data, template, fakeRes)
    } catch (err) {
      reject(err)
    }
  })
}
