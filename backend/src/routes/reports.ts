import { Router } from 'express'
import { PassThrough } from 'stream'
import archiver from 'archiver'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth'
import { requireRole } from '../middleware/requireRole'
import { heavyExportLimiter } from '../middleware/rateLimit'
import { adminClient } from '../lib/supabase'
import { defaultTemplate } from '../templates/parser'
import { streamReportPDF, type ReportData, type SubjectScore, type BehaviourActivityScore } from '../templates/generator'
import { renderSecondTermPDF, secondTermReportBuffer } from '../templates/secondTermOverlay'
import { academicYearSchema, termSchema, uuidSchema } from '../lib/validators'

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

interface GradingScaleRow { letter: string; min_percentage: number; sort_order: number }

const DEFAULT_FIELD_FLAGS = {
  show_class_average: true,
  show_class_highest: true,
  show_position: true,
  show_previous_terms: true,
}

const DEFAULT_GRADING_SCALE: GradingScaleRow[] = [
  { letter: 'A1', min_percentage: 75, sort_order: 1 },
  { letter: 'B2', min_percentage: 70, sort_order: 2 },
  { letter: 'B3', min_percentage: 65, sort_order: 3 },
  { letter: 'C4', min_percentage: 60, sort_order: 4 },
  { letter: 'C5', min_percentage: 55, sort_order: 5 },
  { letter: 'C6', min_percentage: 50, sort_order: 6 },
  { letter: 'D7', min_percentage: 45, sort_order: 7 },
  { letter: 'E8', min_percentage: 40, sort_order: 8 },
  { letter: 'F9', min_percentage:  0, sort_order: 9 },
]

async function loadFieldFlags(): Promise<typeof DEFAULT_FIELD_FLAGS> {
  const { data } = await adminClient
    .from('report_field_settings')
    .select('show_class_average, show_class_highest, show_position, show_previous_terms')
    .eq('id', 1)
    .maybeSingle()
  return {
    show_class_average:  data?.show_class_average  ?? DEFAULT_FIELD_FLAGS.show_class_average,
    show_class_highest:  data?.show_class_highest  ?? DEFAULT_FIELD_FLAGS.show_class_highest,
    show_position:       data?.show_position       ?? DEFAULT_FIELD_FLAGS.show_position,
    show_previous_terms: data?.show_previous_terms ?? DEFAULT_FIELD_FLAGS.show_previous_terms,
  }
}

async function loadGradingScale(): Promise<GradingScaleRow[]> {
  const { data } = await adminClient
    .from('grading_scale')
    .select('letter, min_percentage, sort_order')
    .order('sort_order', { ascending: true })
  if (!data || data.length === 0) return DEFAULT_GRADING_SCALE
  return data as GradingScaleRow[]
}

function gradeForPercentage(p: number, scale: GradingScaleRow[]): string {
  for (const row of scale) {
    if (p >= row.min_percentage) return row.letter
  }
  return scale[scale.length - 1]?.letter ?? 'F9'
}

/** Terms that come BEFORE `term` chronologically. */
function priorTerms(term: string): string[] {
  if (term === 'First Term') return []
  if (term === 'Second Term') return ['First Term']
  if (term === 'Third Term') return ['First Term', 'Second Term']
  return []
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
    fieldFlags,
    scale,
    { data: activitiesData },
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
    loadFieldFlags(),
    loadGradingScale(),
    adminClient
      .from('behaviour_activities')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
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

  // Active-student count in the class — for the report's "Number in class".
  let classSize: number | null = null
  if (classData) {
    const { count } = await adminClient
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classData.id)
      .eq('is_active', true)
    classSize = count ?? null
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
  const totalMaxScore = (components ?? []).reduce((s, c: any) => s + (c.max_score ?? 0), 0)

  // ── Class-wide grades for THIS subject set (current term) — used for the
  //    Class average + Class highest columns. Fetched once per report, then
  //    bucketed per subject. Empty when both flags are off so we don't pay
  //    the round-trip needlessly.
  // Class-wide per-subject grades back the Class avg / Class highest columns AND
  // the per-subject Position column, so fetch them when any of those is wanted.
  const wantClassAggregates =
    (fieldFlags.show_class_average || fieldFlags.show_class_highest || fieldFlags.show_position)
    && classData
    && subjectIds.length > 0
  type ClassGradeRow = { student_id: string; subject_id: string; component_id: string; score: number | null }
  let classGrades: ClassGradeRow[] = []
  if (wantClassAggregates) {
    const { data: classRoster } = await adminClient
      .from('students')
      .select('id')
      .eq('class_id', classData!.id)
      .eq('is_active', true)
    const rosterIds = (classRoster ?? []).map((r: any) => r.id as string)
    if (rosterIds.length > 0) {
      const { data: cg } = await adminClient
        .from('grades')
        .select('student_id, subject_id, component_id, score')
        .eq('class_id', classData!.id)
        .eq('term', term)
        .eq('academic_year', academicYear)
        .in('subject_id', subjectIds)
        .in('student_id', rosterIds)
      classGrades = (cg ?? []) as ClassGradeRow[]
    }
  }

  // ── Previous-term grades for THIS student — used for prev-term column. ──
  const previousTermsList = fieldFlags.show_previous_terms ? priorTerms(term) : []
  type PriorGradeRow = { subject_id: string; component_id: string; score: number | null; term: string }
  let priorGrades: PriorGradeRow[] = []
  if (previousTermsList.length > 0 && subjectIds.length > 0) {
    const { data: pg } = await adminClient
      .from('grades')
      .select('subject_id, component_id, score, term')
      .eq('student_id', studentId)
      .eq('academic_year', academicYear)
      .in('subject_id', subjectIds)
      .in('term', previousTermsList)
    priorGrades = (pg ?? []) as PriorGradeRow[]
  }

  // Per-subject helpers used below to compute class avg / highest.
  function studentPercentageForSubject(
    subjectId: string,
    rows: { component_id: string; score: number | null }[],
  ): number | null {
    if (totalMaxScore <= 0) return null
    let total = 0
    let anyScore = false
    for (const r of rows) {
      if (r.score === null || r.score === undefined) continue
      anyScore = true
      total += r.score
    }
    if (!anyScore) return null
    return (total / totalMaxScore) * 100
  }

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

    // Class aggregates + per-subject position for this subject
    let classAverage: number | null = null
    let classHighest: number | null = null
    let positionInClass: number | null = null
    if (wantClassAggregates) {
      const perStudent = new Map<string, { component_id: string; score: number | null }[]>()
      for (const row of classGrades) {
        if (row.subject_id !== subj.id) continue
        const list = perStudent.get(row.student_id) ?? []
        list.push({ component_id: row.component_id, score: row.score })
        perStudent.set(row.student_id, list)
      }
      // One percentage per classmate (only those with a score for this subject).
      const ranked: { studentId: string; pct: number }[] = []
      for (const [sid, rows] of perStudent) {
        const p = studentPercentageForSubject(subj.id, rows)
        if (p !== null) ranked.push({ studentId: sid, pct: p })
      }
      if (ranked.length > 0) {
        const percentages = ranked.map((r) => r.pct)
        classAverage = percentages.reduce((a, b) => a + b, 0) / percentages.length
        classHighest = percentages.reduce((a, b) => Math.max(a, b), -Infinity)

        // Competition rank (ties share a rank) of THIS student for THIS subject.
        if (ranked.some((r) => r.studentId === studentId)) {
          ranked.sort((a, b) => b.pct - a.pct)
          let lastPct: number | null = null
          let lastRank = 0
          for (let i = 0; i < ranked.length; i++) {
            const rank = ranked[i].pct === lastPct ? lastRank : i + 1
            if (ranked[i].studentId === studentId) positionInClass = rank
            lastPct = ranked[i].pct
            lastRank = rank
          }
        }
      }
    }

    // Previous-term percentages for this subject
    const previousTerms: { term: string; percentage: number | null }[] = []
    for (const t of previousTermsList) {
      const rows = priorGrades
        .filter((g) => g.subject_id === subj.id && g.term === t)
        .map((g) => ({ component_id: g.component_id, score: g.score }))
      previousTerms.push({
        term: t,
        percentage: rows.length > 0 ? studentPercentageForSubject(subj.id, rows) : null,
      })
    }

    subjectScores.push({
      name: subj.name,
      ca1,
      ca2,
      exam,
      total,
      percentage,
      grade: gradeForPercentage(percentage, scale),
      classAverage,
      classHighest,
      positionInClass,
      previousTerms,
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

  // ── Behaviour activity scores ─────────────────────────────────────────────
  // For each active activity: pull the current-term score, plus prior-term
  // scores when the report's term is Second/Third. Average is computed across
  // every term that has a score; null when none recorded.
  const activities = (activitiesData ?? []) as { id: string; name: string; sort_order: number }[]
  const behaviourActivities: BehaviourActivityScore[] = []
  if (activities.length > 0) {
    const activityIds = activities.map((a) => a.id)
    const termsToFetch = [term, ...priorTerms(term)]
    const { data: bRows } = await adminClient
      .from('student_behaviour_scores')
      .select('activity_id, term, score')
      .eq('student_id', studentId)
      .eq('academic_year', academicYear)
      .in('activity_id', activityIds)
      .in('term', termsToFetch)

    type BRow = { activity_id: string; term: string; score: number | null }
    const byActivityTerm = new Map<string, number | null>()
    for (const r of (bRows ?? []) as BRow[]) {
      byActivityTerm.set(`${r.activity_id}::${r.term}`, r.score)
    }

    const priorTermList = priorTerms(term)
    for (const a of activities) {
      const current = byActivityTerm.get(`${a.id}::${term}`) ?? null
      const previousTerms = priorTermList.map((t) => ({
        term: t,
        score: byActivityTerm.get(`${a.id}::${t}`) ?? null,
      }))
      const all: number[] = []
      if (typeof current === 'number') all.push(current)
      for (const p of previousTerms) if (typeof p.score === 'number') all.push(p.score)
      const averageAcrossTerms = all.length > 0
        ? all.reduce((s, v) => s + v, 0) / all.length
        : null
      behaviourActivities.push({
        name: a.name,
        current,
        previousTerms,
        averageAcrossTerms,
      })
    }
  }

  return {
    studentName: student.full_name,
    studentNumber: student.student_number ?? null,
    className: classData?.name ?? '',
    classSize,
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
    showFields: fieldFlags,
    behaviourActivities,
  }
}

// `percentageToGrade` was inlined here for the bootstrapping period. The
// scale-aware `gradeForPercentage(p, scale)` defined above replaces it.

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /reports/student/:id?term=&year=
 * Streams a single student's PDF report.
 */
const singleReportParam = z.object({ id: uuidSchema })
const singleReportQuery = z.object({
  term: termSchema.optional(),
  year: academicYearSchema.optional(),
})

reportsRouter.get('/student/:id', heavyExportLimiter, async (req, res) => {
  // Single-student PDF preview is admin-only (used by /admin/reports).
  if (req.role !== 'ADMIN') {
    res.status(403).send()
    return
  }
  const paramParsed = singleReportParam.safeParse(req.params)
  if (!paramParsed.success) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const queryParsed = singleReportQuery.safeParse(req.query)
  if (!queryParsed.success) {
    res.status(400).json({ error: 'Invalid query parameters' })
    return
  }
  const term = queryParsed.data.term ?? 'First Term'
  const year = queryParsed.data.year ?? '2025/2026'

  const reportData = await buildReportData(paramParsed.data.id, term, year)
  if (!reportData) {
    res.status(404).json({ error: 'Student not found' })
    return
  }

  const filename = `${slugify(reportData.studentName)}_Report_Sheet.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  // Second Term uses the school's fixed template (overlay renderer); other terms
  // keep the from-scratch generator until their own templates arrive.
  if (term === 'Second Term') {
    const bytes = await renderSecondTermPDF(reportData)
    res.end(Buffer.from(bytes))
    return
  }

  streamReportPDF(reportData, defaultTemplate(), res)
})

/**
 * POST /reports/bulk
 * Body: { studentIds: string[], term: string, academicYear: string }
 * Returns a ZIP of all student PDFs.
 */
const bulkBody = z.object({
  studentIds: z.array(uuidSchema).min(1).max(100),
  term: termSchema,
  academicYear: academicYearSchema,
})

reportsRouter.post('/bulk', heavyExportLimiter, async (req, res) => {
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

    // Second Term → fixed-template overlay; other terms → from-scratch generator.
    const pdfBuffer = term === 'Second Term'
      ? await secondTermReportBuffer(data)
      : await pdfToBuffer(data, template)
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
