import { Router } from 'express'
import archiver from 'archiver'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth'
import { requireRole } from '../middleware/requireRole'
import { adminClient } from '../lib/supabase'
import { academicYearSchema, termSchema, uuidSchema } from '../lib/validators'

const idParam = z.object({ id: uuidSchema })

export const adminRouter = Router()

// All admin routes: must be ADMIN
adminRouter.use(requireAuth, requireRole(['ADMIN']))

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createTeacherBody = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(200),
  password: z.string().min(8),
})

const assignTeacherBody = z.object({
  teacher_id: uuidSchema,
  class_id: uuidSchema,
  subject_id: uuidSchema,
  term: termSchema,
  academic_year: academicYearSchema,
})

// ─── Teachers ─────────────────────────────────────────────────────────────────

/** GET /admin/teachers */
adminRouter.get('/teachers', async (_req, res) => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, full_name, email, role, is_active, created_at')
    .order('full_name')

  if (error) {
    res.status(500).json({ error: 'Failed to fetch teachers' })
    return
  }

  res.json(data)
})

/** POST /admin/teachers — creates Supabase auth user + profile */
adminRouter.post('/teachers', async (req, res) => {
  const parsed = createTeacherBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' })
    return
  }

  const { email, full_name, password } = parsed.data

  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: 'TEACHER' },
    })

  if (authError) {
    // Don't leak details — just 422 if user already exists
    const status = authError.message.includes('already') ? 409 : 422
    res.status(status).json({ error: 'Could not create user' })
    return
  }

  res.status(201).json({ id: authData.user.id, email, full_name })
})

/**
 * PATCH /admin/teachers/:id/deactivate
 *
 * Safety guards mirror the frontend `toggleTeacherStatusAction` so a direct
 * HTTP request can't bypass them:
 *   - admin can never deactivate ANOTHER admin
 *   - admin can deactivate themselves, BUT not when they're the only active
 *     admin (would leave the school with no path back to admin access)
 */
adminRouter.patch('/teachers/:id/deactivate', async (req, res) => {
  const paramParsed = idParam.safeParse(req.params)
  if (!paramParsed.success) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const targetId = paramParsed.data.id
  const callerId = req.user!.id

  const { data: target, error: lookupErr } = await adminClient
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', targetId)
    .maybeSingle()

  if (lookupErr) {
    console.error('[admin teachers deactivate] lookup error:', lookupErr)
    res.status(500).json({ error: 'Failed to deactivate teacher' })
    return
  }
  if (!target) {
    res.status(404).send()
    return
  }

  if (target.role === 'ADMIN') {
    if (target.id !== callerId) {
      res.status(403).json({ error: "Admins can't deactivate another admin's account." })
      return
    }
    const { count: activeAdmins } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'ADMIN')
      .eq('is_active', true)
    if ((activeAdmins ?? 0) <= 1) {
      res.status(409).json({
        error: 'You are the only active administrator. Promote another admin first.',
      })
      return
    }
  }

  const { error } = await adminClient
    .from('profiles')
    .update({ is_active: false })
    .eq('id', targetId)

  if (error) {
    console.error('[admin teachers deactivate] update error:', error)
    res.status(500).json({ error: 'Failed to deactivate teacher' })
    return
  }

  res.status(204).send()
})

/** PATCH /admin/teachers/:id/reactivate */
adminRouter.patch('/teachers/:id/reactivate', async (req, res) => {
  const paramParsed = idParam.safeParse(req.params)
  if (!paramParsed.success) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const { error } = await adminClient
    .from('profiles')
    .update({ is_active: true })
    .eq('id', paramParsed.data.id)

  if (error) {
    console.error('[admin teachers reactivate] error:', error)
    res.status(500).json({ error: 'Failed to reactivate teacher' })
    return
  }

  res.status(204).send()
})

// ─── Assignments ──────────────────────────────────────────────────────────────

/** GET /admin/assignments */
adminRouter.get('/assignments', async (_req, res) => {
  const { data, error } = await adminClient
    .from('teacher_assignments')
    .select(
      `id, term, academic_year,
       profiles!teacher_id ( full_name, email ),
       classes!class_id ( name, level ),
       subjects!subject_id ( name )`,
    )
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to fetch assignments' })
    return
  }

  res.json(data)
})

/** POST /admin/assignments */
adminRouter.post('/assignments', async (req, res) => {
  const parsed = assignTeacherBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' })
    return
  }

  const { data, error } = await adminClient
    .from('teacher_assignments')
    .insert(parsed.data)
    .select()
    .single()

  if (error) {
    const status = error.code === '23505' ? 409 : 500
    res.status(status).json({ error: 'Failed to create assignment' })
    return
  }

  res.status(201).json(data)
})

/** DELETE /admin/assignments/:id */
adminRouter.delete('/assignments/:id', async (req, res) => {
  const paramParsed = idParam.safeParse(req.params)
  if (!paramParsed.success) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const { error } = await adminClient
    .from('teacher_assignments')
    .delete()
    .eq('id', paramParsed.data.id)

  if (error) {
    console.error('[admin assignments DELETE] error:', error)
    res.status(500).json({ error: 'Failed to delete assignment' })
    return
  }

  res.status(204).send()
})

// ─── CSV grade export ─────────────────────────────────────────────────────────

/**
 * GET /admin/grades-export?term=&academicYear=&classId=
 * Streams all grades for the given term/year as CSV. Optional classId filter.
 * ADMIN-only — gated by the router-level requireRole above.
 */
const gradesExportQuery = z.object({
  term: termSchema,
  academicYear: academicYearSchema,
  classId: uuidSchema.optional(),
})

adminRouter.get('/grades-export', async (req, res) => {
  const parsedQuery = gradesExportQuery.safeParse(req.query)
  if (!parsedQuery.success) {
    res.status(400).json({ error: 'Invalid query parameters' })
    return
  }
  const { term, academicYear, classId } = parsedQuery.data

  // Pull grades joined with student / class / subject / component metadata.
  let query = adminClient
    .from('grades')
    .select(`
      score, term, academic_year,
      students!student_id ( full_name, student_number, classes!class_id ( name ) ),
      subjects!subject_id ( name ),
      score_components!component_id ( name )
    `)
    .eq('term', term)
    .eq('academic_year', academicYear)

  if (classId) query = query.eq('class_id', classId)

  const { data, error } = await query
  if (error) {
    console.error('[admin grades-export] error:', error)
    res.status(500).json({ error: 'Failed to fetch grades' })
    return
  }

  // Pivot rows into one row per (student, subject) with CA1/CA2/Exam columns.
  type Row = {
    className: string
    studentName: string
    studentNumber: string
    subject: string
    ca1: string
    ca2: string
    exam: string
    total: number
  }
  const pivot = new Map<string, Row>()
  for (const g of (data ?? []) as any[]) {
    const student = g.students
    const subject = g.subjects
    const comp = g.score_components
    if (!student || !subject || !comp) continue

    const studentName = student.full_name as string
    const className = student.classes?.name ?? 'Unassigned'
    const studentNumber = student.student_number ?? ''
    const subjectName = subject.name as string
    const score = g.score as number | null
    const key = `${studentName}::${subjectName}`

    const r = pivot.get(key) ?? {
      className,
      studentName,
      studentNumber,
      subject: subjectName,
      ca1: '',
      ca2: '',
      exam: '',
      total: 0,
    }
    const cn = (comp.name as string).toLowerCase()
    const cell = score === null || score === undefined ? '' : String(score)
    if (cn.includes('ca 1') || cn.includes('ca1')) r.ca1 = cell
    else if (cn.includes('ca 2') || cn.includes('ca2')) r.ca2 = cell
    else if (cn.includes('exam')) r.exam = cell
    if (typeof score === 'number') r.total += score
    pivot.set(key, r)
  }

  const rows = Array.from(pivot.values()).sort((a, b) => {
    if (a.className !== b.className) return a.className.localeCompare(b.className)
    if (a.studentName !== b.studentName) return a.studentName.localeCompare(b.studentName)
    return a.subject.localeCompare(b.subject)
  })

  const headers = ['Class', 'Student', 'Student #', 'Subject', 'CA1', 'CA2', 'Exam', 'Total', 'Term', 'Academic Year']
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push([
      csvCell(r.className),
      csvCell(r.studentName),
      csvCell(r.studentNumber),
      csvCell(r.subject),
      r.ca1,
      r.ca2,
      r.exam,
      r.total === 0 && r.ca1 === '' && r.ca2 === '' && r.exam === '' ? '' : String(r.total),
      csvCell(term),
      csvCell(academicYear),
    ].join(','))
  }

  const filename = `grades_${slugify(term)}_${slugify(academicYear)}.csv`
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  // Excel-friendly BOM so accented characters render correctly.
  res.write('﻿')
  res.end(lines.join('\n'))
})

function csvCell(v: string): string {
  if (v == null) return ''
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function slugify(s: string): string {
  return s.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
}

// ─── Audit log ────────────────────────────────────────────────────────────────

const auditQuery = z.object({ gradeId: uuidSchema.optional() })

/** GET /admin/audit?gradeId= — admin read-only view of audit entries */
adminRouter.get('/audit', async (req, res) => {
  const parsedQuery = auditQuery.safeParse(req.query)
  if (!parsedQuery.success) {
    res.status(400).json({ error: 'Invalid query parameters' })
    return
  }
  let query = adminClient
    .from('grade_audit_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(500)

  if (parsedQuery.data.gradeId) {
    query = query.eq('grade_id', parsedQuery.data.gradeId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[admin audit] error:', error)
    res.status(500).json({ error: 'Failed to fetch audit log' })
    return
  }

  res.json(data)
})

// ─── Year archive export ──────────────────────────────────────────────────────

/**
 * GET /admin/year-archive/:year/export
 * Streams a ZIP of CSVs containing every year-scoped record for the given
 * academic_year — grades, teacher_assignments, class_teacher_assignments,
 * student_remarks. Used as the "export before delete" safety net so an admin
 * never loses past-year data when freeing storage.
 *
 * The :year param is URL-encoded ("2025%2F2026").
 */
adminRouter.get('/year-archive/:year/export', async (req, res) => {
  const year = decodeURIComponent(req.params.year)
  if (!year || !/^\d{4}\/\d{4}$/.test(year)) {
    res.status(400).json({ error: 'Invalid academic_year' })
    return
  }

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="year_archive_${slugify(year)}.zip"`,
  )

  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.on('error', (err) => {
    console.error('[year-archive export] archiver error:', err)
    res.end()
  })
  archive.pipe(res)

  // ── grades.csv ───────────────────────────────────────────────────────────
  const { data: gradeRows } = await adminClient
    .from('grades')
    .select(`
      score, term, academic_year, entered_by,
      students!student_id ( full_name, student_number, classes!class_id ( name ) ),
      subjects!subject_id ( name ),
      score_components!component_id ( name )
    `)
    .eq('academic_year', year)

  archive.append(
    toCsv(
      ['Class', 'Student', 'Student #', 'Subject', 'Component', 'Score', 'Term', 'Academic Year'],
      (gradeRows ?? []).map((g: any) => [
        g.students?.classes?.name ?? '',
        g.students?.full_name ?? '',
        g.students?.student_number ?? '',
        g.subjects?.name ?? '',
        g.score_components?.name ?? '',
        g.score == null ? '' : String(g.score),
        g.term,
        g.academic_year,
      ]),
    ),
    { name: 'grades.csv' },
  )

  // ── teacher_assignments.csv ─────────────────────────────────────────────
  const { data: subjectAssignments } = await adminClient
    .from('teacher_assignments')
    .select(`
      term, academic_year,
      profiles!teacher_id ( full_name, email ),
      classes!class_id ( name ),
      subjects!subject_id ( name )
    `)
    .eq('academic_year', year)

  archive.append(
    toCsv(
      ['Teacher', 'Email', 'Class', 'Subject', 'Term', 'Academic Year'],
      (subjectAssignments ?? []).map((a: any) => [
        a.profiles?.full_name ?? '',
        a.profiles?.email ?? '',
        a.classes?.name ?? '',
        a.subjects?.name ?? '',
        a.term,
        a.academic_year,
      ]),
    ),
    { name: 'teacher_assignments.csv' },
  )

  // ── class_teacher_assignments.csv ───────────────────────────────────────
  const { data: classTeachers } = await adminClient
    .from('class_teacher_assignments')
    .select(`
      term, academic_year,
      profiles!teacher_id ( full_name, email ),
      classes!class_id ( name )
    `)
    .eq('academic_year', year)

  archive.append(
    toCsv(
      ['Class Teacher', 'Email', 'Class', 'Term', 'Academic Year'],
      (classTeachers ?? []).map((a: any) => [
        a.profiles?.full_name ?? '',
        a.profiles?.email ?? '',
        a.classes?.name ?? '',
        a.term,
        a.academic_year,
      ]),
    ),
    { name: 'class_teacher_assignments.csv' },
  )

  // ── student_remarks.csv ─────────────────────────────────────────────────
  const { data: remarks } = await adminClient
    .from('student_remarks')
    .select(`
      term, academic_year, times_present, times_absent, times_late,
      behaviour_rating, teacher_remark, principal_remark, position,
      students!student_id ( full_name, student_number ),
      classes!class_id ( name )
    `)
    .eq('academic_year', year)

  archive.append(
    toCsv(
      [
        'Class', 'Student', 'Student #', 'Term', 'Academic Year',
        'Position', 'Times Present', 'Times Absent', 'Times Late',
        'Behaviour', 'Teacher Remark', 'Principal Remark',
      ],
      (remarks ?? []).map((r: any) => [
        r.classes?.name ?? '',
        r.students?.full_name ?? '',
        r.students?.student_number ?? '',
        r.term,
        r.academic_year,
        r.position == null ? '' : String(r.position),
        String(r.times_present ?? ''),
        String(r.times_absent ?? ''),
        String(r.times_late ?? ''),
        r.behaviour_rating ?? '',
        r.teacher_remark ?? '',
        r.principal_remark ?? '',
      ]),
    ),
    { name: 'student_remarks.csv' },
  )

  await archive.finalize()
})

function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) lines.push(row.map(csvCell).join(','))
  // BOM up front so Excel handles UTF-8 cleanly.
  return '﻿' + lines.join('\n')
}
