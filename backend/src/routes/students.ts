import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth'
import { requireRole } from '../middleware/requireRole'
import { adminClient } from '../lib/supabase'
import { teacherCanSeeStudent, uuidSchema } from '../lib/validators'

export const studentsRouter = Router()

studentsRouter.use(requireAuth, requireRole(['TEACHER', 'ADMIN']))

// ─── Schemas ──────────────────────────────────────────────────────────────────

const enrollBody = z.object({
  full_name: z.string().min(1).max(200),
  student_number: z.string().max(50).nullable().optional(),
  class_id: z.string().uuid(),
  subject_ids: z.array(z.string().uuid()).min(1, 'Select at least one subject'),
})

const updateBody = z.object({
  full_name: z.string().min(1).max(200).optional(),
  student_number: z.string().max(50).nullable().optional(),
  class_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
})

const updateSubjectsBody = z.object({
  subject_ids: z.array(z.string().uuid()).min(1),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

const listQuery = z.object({
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
})

const idParam = z.object({ id: uuidSchema })

/** GET /students?classId= */
studentsRouter.get('/', async (req, res) => {
  const parsedQuery = listQuery.safeParse(req.query)
  if (!parsedQuery.success) {
    res.status(400).json({ error: 'Invalid query parameters' })
    return
  }
  const { classId, subjectId } = parsedQuery.data
  const userId = req.user!.id
  const role = req.role

  let studentIds: string[] | null = null

  // If filtering by subject, resolve enrollment first
  if (subjectId) {
    const { data: enrolled } = await adminClient
      .from('student_subjects')
      .select('student_id')
      .eq('subject_id', subjectId)
    studentIds = enrolled?.map((e) => e.student_id) ?? []
  }

  let query = adminClient
    .from('students')
    .select('*, classes(id, name, level, arm)')
    .eq('is_active', true)
    .order('full_name')

  if (classId) query = query.eq('class_id', classId)
  if (studentIds !== null && studentIds.length > 0) query = query.in('id', studentIds)
  if (studentIds !== null && studentIds.length === 0) {
    // No enrolled students for this subject
    res.json([])
    return
  }

  // Teacher: scope to assigned classes only
  if (role === 'TEACHER') {
    const { data: assignments } = await adminClient
      .from('teacher_assignments')
      .select('class_id')
      .eq('teacher_id', userId)

    const classIds = assignments?.map((a) => a.class_id) ?? []

    // Also check class teacher assignments
    const { data: ctAssignments } = await adminClient
      .from('class_teacher_assignments')
      .select('class_id')
      .eq('teacher_id', userId)

    const ctClassIds = ctAssignments?.map((a) => a.class_id) ?? []
    const allClassIds = [...new Set([...classIds, ...ctClassIds])]

    if (allClassIds.length === 0) {
      res.json([])
      return
    }

    if (!classId) {
      query = query.in('class_id', allClassIds)
    }
  }

  const { data, error } = await query

  if (error) {
    console.error('[students GET] supabase error:', error)
    res.status(500).json({ error: 'Failed to fetch students' })
    return
  }

  res.json(data)
})

/** POST /students — ADMIN only: enroll a new student */
studentsRouter.post('/', requireRole(['ADMIN']), async (req, res) => {
  const parsed = enrollBody.safeParse(req.body)
  if (!parsed.success) {
    // Don't echo zod's internal error text — uniform "Invalid body" so the
    // surface isn't probable for field-name enumeration.
    res.status(400).json({ error: 'Invalid body' })
    return
  }

  const { full_name, student_number, class_id, subject_ids } = parsed.data

  // Create student
  const { data: student, error: studentErr } = await adminClient
    .from('students')
    .insert({ full_name, student_number: student_number ?? null, class_id })
    .select()
    .single()

  if (studentErr) {
    console.error('[students POST] insert error:', studentErr)
    res.status(500).json({ error: 'Failed to enroll student' })
    return
  }

  // Create subject enrollments
  const { error: subjectErr } = await adminClient
    .from('student_subjects')
    .insert(subject_ids.map((sid: string) => ({ student_id: student.id, subject_id: sid })))

  if (subjectErr) {
    console.error('[students POST] subjects insert error:', subjectErr)
    // Rollback student if subjects fail
    await adminClient.from('students').delete().eq('id', student.id)
    res.status(500).json({ error: 'Failed to save subject enrollments' })
    return
  }

  res.status(201).json(student)
})

/** PATCH /students/:id — ADMIN only */
studentsRouter.patch('/:id', requireRole(['ADMIN']), async (req, res) => {
  const paramParsed = idParam.safeParse(req.params)
  if (!paramParsed.success) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const parsed = updateBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' })
    return
  }

  const { data, error } = await adminClient
    .from('students')
    .update(parsed.data)
    .eq('id', paramParsed.data.id)
    .select()
    .single()

  if (error) {
    console.error('[students PATCH] error:', error)
    res.status(500).json({ error: 'Failed to update student' })
    return
  }

  res.json(data)
})

/** PUT /students/:id/subjects — ADMIN only: replace subject enrollments */
studentsRouter.put('/:id/subjects', requireRole(['ADMIN']), async (req, res) => {
  const paramParsed = idParam.safeParse(req.params)
  if (!paramParsed.success) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const parsed = updateSubjectsBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' })
    return
  }

  const studentId = paramParsed.data.id

  // Delete existing and re-insert
  await adminClient.from('student_subjects').delete().eq('student_id', studentId)

  const { error } = await adminClient
    .from('student_subjects')
    .insert(parsed.data.subject_ids.map((sid: string) => ({ student_id: studentId, subject_id: sid })))

  if (error) {
    console.error('[students PUT subjects] error:', error)
    res.status(500).json({ error: 'Failed to update subject enrollments' })
    return
  }

  res.status(204).send()
})

/**
 * GET /students/:id/subjects — enrolled subjects for a student.
 * IDOR guard: a TEACHER must be a subject teacher for the student's class OR
 * its class teacher. Otherwise 403. Admin sees all.
 */
studentsRouter.get('/:id/subjects', async (req, res) => {
  const paramParsed = idParam.safeParse(req.params)
  if (!paramParsed.success) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const studentId = paramParsed.data.id

  if (req.role === 'TEACHER') {
    const allowed = await teacherCanSeeStudent(req.user!.id, studentId)
    if (!allowed) {
      res.status(403).send()
      return
    }
  }

  const { data, error } = await adminClient
    .from('student_subjects')
    .select('*, subjects(id, name)')
    .eq('student_id', studentId)

  if (error) {
    console.error('[students GET subjects] error:', error)
    res.status(500).json({ error: 'Failed to fetch subjects' })
    return
  }

  res.json(data)
})
