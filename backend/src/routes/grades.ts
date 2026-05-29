import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth'
import { requireRole } from '../middleware/requireRole'
import { adminClient } from '../lib/supabase'
import {
  RAW_SCORE_CEILING,
  academicYearSchema,
  getComponentMaxScore,
  teacherOwnsAssignment,
  termSchema,
  uuidSchema,
} from '../lib/validators'

export const gradesRouter = Router()

// All grade routes require a valid session + TEACHER or ADMIN role
gradesRouter.use(requireAuth, requireRole(['TEACHER', 'ADMIN']))

// ─── Schemas ──────────────────────────────────────────────────────────────────

const getGradesQuery = z.object({
  classId: uuidSchema,
  subjectId: uuidSchema,
  term: termSchema,
  academicYear: academicYearSchema,
})

// PUT body is partial — only score is editable; class/subject/term/year are
// frozen onto the grade row at insert time and can't be retargeted by a PUT.
const updateGradeBody = z.object({
  // Hard upper bound at RAW_SCORE_CEILING. Per-component max_score is
  // re-checked after the row is looked up so CA1's max=20 still blocks 50.
  score: z.number().min(0).max(RAW_SCORE_CEILING).nullable(),
})

const idParam = z.object({ id: uuidSchema })

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /grades?classId=&subjectId=&term=&academicYear=
 * Returns all grades for a class+subject. Teachers must own the
 * (class_id, subject_id) via teacher_assignments — otherwise 403. Admin sees
 * all.
 */
gradesRouter.get('/', async (req, res) => {
  const parsed = getGradesQuery.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters' })
    return
  }

  const { classId, subjectId, term, academicYear } = parsed.data

  // IDOR guard — adminClient bypasses RLS so we must enforce scope explicitly.
  if (req.role === 'TEACHER') {
    const allowed = await teacherOwnsAssignment(req.user!.id, classId, subjectId)
    if (!allowed) {
      res.status(403).send()
      return
    }
  }

  const { data, error } = await adminClient
    .from('grades')
    .select('*')
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('term', term)
    .eq('academic_year', academicYear)

  if (error) {
    console.error('[grades GET] supabase error:', error)
    res.status(500).json({ error: 'Failed to fetch grades' })
    return
  }

  res.json(data)
})

/**
 * PUT /grades/:id
 * Update a single grade score. Teacher must own the row's class+subject;
 * score must be within the component's max_score.
 */
gradesRouter.put('/:id', async (req, res) => {
  const paramParsed = idParam.safeParse(req.params)
  if (!paramParsed.success) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const parsed = updateGradeBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' })
    return
  }

  const gradeId = paramParsed.data.id
  const userId = req.user!.id

  // Pull the row up-front — we need class_id / subject_id / component_id for
  // both the IDOR check and the component-max validation.
  const { data: existing, error: lookupErr } = await adminClient
    .from('grades')
    .select('class_id, subject_id, component_id')
    .eq('id', gradeId)
    .maybeSingle()

  if (lookupErr) {
    console.error('[grades PUT] lookup error:', lookupErr)
    res.status(500).json({ error: 'Update failed' })
    return
  }
  if (!existing) {
    res.status(404).send()
    return
  }

  if (req.role === 'TEACHER') {
    const allowed = await teacherOwnsAssignment(
      userId,
      existing.class_id as string,
      existing.subject_id as string,
    )
    if (!allowed) {
      res.status(403).send()
      return
    }
  }

  // Per-component cap. CA1=20, CA2=20, Exam=60. Bypassing the frontend with a
  // raw payload would have allowed score=99 on CA1 before this check.
  if (parsed.data.score !== null) {
    const max = await getComponentMaxScore(existing.component_id as string)
    if (max !== null && parsed.data.score > max) {
      res.status(400).json({ error: `Score exceeds component max (${max})` })
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
    console.error('[grades PUT] update error:', error)
    res.status(500).json({ error: 'Update failed' })
    return
  }

  res.json(data)
})
