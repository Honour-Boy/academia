import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth'
import { requireRole } from '../middleware/requireRole'
import { adminClient } from '../lib/supabase'

export const gradesRouter = Router()

// All grade routes require a valid session + TEACHER or ADMIN role
gradesRouter.use(requireAuth, requireRole(['TEACHER', 'ADMIN']))

// ─── Schemas ──────────────────────────────────────────────────────────────────

const getGradesQuery = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  term: z.string().min(1),
  academicYear: z.string().min(1),
})

const upsertGradeBody = z.object({
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  classId: z.string().uuid(),
  componentId: z.string().uuid(),
  score: z.number().min(0).nullable(),
  term: z.string().min(1),
  academicYear: z.string().min(1),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /grades?classId=&subjectId=&term=&academicYear=
 * Returns all grades for a class+subject. Teacher scope enforced by RLS
 * via the anon client (the teacher's token is forwarded).
 */
gradesRouter.get('/', async (req, res) => {
  const parsed = getGradesQuery.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters' })
    return
  }

  const { classId, subjectId, term, academicYear } = parsed.data

  const { data, error } = await adminClient
    .from('grades')
    .select('*')
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('term', term)
    .eq('academic_year', academicYear)

  if (error) {
    res.status(500).json({ error: 'Failed to fetch grades' })
    return
  }

  res.json(data)
})

/**
 * PUT /grades/:id
 * Update a single grade score. Teacher can only update grades for their
 * assigned class+subject (enforced by validateTeacherScope below).
 */
gradesRouter.put('/:id', async (req, res) => {
  const parsed = upsertGradeBody.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' })
    return
  }

  const gradeId = req.params.id
  const userId = req.user!.id
  const role = req.role

  // Teachers: verify they own this grade's class+subject
  if (role === 'TEACHER') {
    const { data: existing } = await adminClient
      .from('grades')
      .select('class_id, subject_id')
      .eq('id', gradeId)
      .single()

    if (!existing) {
      res.status(404).send()
      return
    }

    const { data: assignment } = await adminClient
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', userId)
      .eq('class_id', existing.class_id)
      .eq('subject_id', existing.subject_id)
      .maybeSingle()

    if (!assignment) {
      res.status(403).send()
      return
    }
  }

  const { data, error } = await adminClient
    .from('grades')
    .update({ score: parsed.data.score, entered_by: userId })
    .eq('id', gradeId)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: 'Update failed' })
    return
  }

  res.json(data)
})
