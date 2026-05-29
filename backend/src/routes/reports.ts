import { Router } from 'express'
import { PassThrough } from 'stream'
import archiver from 'archiver'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth'
import { requireRole } from '../middleware/requireRole'
import { adminClient } from '../lib/supabase'
import { defaultTemplate } from '../templates/parser'
import { streamReportPDF, type ReportData, type SubjectScore } from '../templates/generator'

export const reportsRouter = Router()

// Reports are admin-only at the router level. Individual routes that should
// be reachable by a class teacher for their own class loosen the gate
// inline + do a scoping check (see POST /bulk).
reportsRouter.use(requireAuth, requireRole(['TEACHER', 'ADMIN']))

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
    // Position is computed + persisted by POST /reports/bulk. Single-student
    // GETs read the last-computed value; may be NULL if bulk has never run.
    position: (remark as any)?.position ?? null,
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
  // Single-student PDF preview is admin-only (used by /admin/reports).
  if (req.role !== 'ADMIN') {
    res.status(403).send()
    return
  }
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

  // Compute + persist class rank for every class the requested students belong
  // to. Done up-front so each report has a fresh position.
  const { data: classRows } = await adminClient
    .from('students')
    .select('id, class_id')
    .in('id', studentIds)
  const classIds = Array.from(new Set((classRows ?? []).map((r: any) => r.class_id).filter(Boolean))) as string[]

  // Scoping for TEACHER role: must be class teacher of EVERY class the
  // requested students belong to, for this term/year. Admin bypasses.
  if (req.role !== 'ADMIN') {
    if (classIds.length === 0) {
      res.status(403).send()
      return
    }
    const { data: ctaRows } = await adminClient
      .from('class_teacher_assignments')
      .select('class_id')
      .eq('teacher_id', req.user!.id)
      .eq('term', term)
      .eq('academic_year', academicYear)
      .in('class_id', classIds)
    const teacherClassIds = new Set((ctaRows ?? []).map((r: any) => r.class_id))
    const missing = classIds.filter((cid) => !teacherClassIds.has(cid))
    if (missing.length > 0) {
      res.status(403).send()
      return
    }
  }

  for (const classId of classIds) {
    await recomputeAndPersistClassRank(classId, term, academicYear)
  }

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

/**
 * For one class+term+year: compute each active student's overall total from
 * `grades`, rank them 1..N (ties share rank — competition ranking), and upsert
 * the result into `student_remarks.position`. Idempotent — runs before every
 * bulk generation so rank reflects the latest scores.
 */
async function recomputeAndPersistClassRank(
  classId: string,
  term: string,
  academicYear: string,
): Promise<void> {
  // Pull active students in the class + their grades for the term.
  const { data: students } = await adminClient
    .from('students')
    .select('id')
    .eq('class_id', classId)
    .eq('is_active', true)
  if (!students || students.length === 0) return

  const studentIds = students.map((s: any) => s.id as string)
  const { data: grades } = await adminClient
    .from('grades')
    .select('student_id, score')
    .in('student_id', studentIds)
    .eq('term', term)
    .eq('academic_year', academicYear)

  const totals = new Map<string, number>()
  for (const id of studentIds) totals.set(id, 0)
  for (const g of (grades ?? []) as any[]) {
    if (typeof g.score === 'number') {
      totals.set(g.student_id, (totals.get(g.student_id) ?? 0) + g.score)
    }
  }

  // Sort descending by total. Competition ranking: tied students share rank,
  // next rank skips by the number of ties.
  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
  const positions = new Map<string, number>()
  let lastScore: number | null = null
  let lastRank = 0
  for (let i = 0; i < sorted.length; i++) {
    const [studentId, score] = sorted[i]
    const rank = score === lastScore ? lastRank : i + 1
    positions.set(studentId, rank)
    lastScore = score
    lastRank = rank
  }

  // Upsert into student_remarks. The UNIQUE(student_id, term, academic_year)
  // constraint makes this safe.
  const rows = Array.from(positions.entries()).map(([studentId, position]) => ({
    student_id: studentId,
    class_id: classId,
    term,
    academic_year: academicYear,
    position,
  }))
  if (rows.length === 0) return

  // Upsert by the unique key. If a row already exists (with attendance + remarks),
  // only the position field changes.
  await adminClient
    .from('student_remarks')
    .upsert(rows, { onConflict: 'student_id,term,academic_year' })
}

/** Helper: render PDF to Buffer using pdfkit */
function pdfToBuffer(data: ReportData, template: ReturnType<typeof defaultTemplate>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const pass = new PassThrough()

    pass.on('data', (chunk: Buffer) => chunks.push(chunk))
    pass.on('end', () => resolve(Buffer.concat(chunks)))
    pass.on('error', reject)

    try {
      streamReportPDF(data, template, pass)
    } catch (err) {
      reject(err)
    }
  })
}
