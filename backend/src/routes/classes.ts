import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth'
import { requireRole } from '../middleware/requireRole'
import { adminClient } from '../lib/supabase'

export const classesRouter = Router()

classesRouter.use(requireAuth, requireRole(['TEACHER', 'ADMIN']))

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createClassBody = z.object({
  name: z.string().min(1).max(100),
  level: z.enum(['JSS', 'SS']),
  arm: z.string().min(1).max(10).default('A'),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /classes — ADMIN: all classes; TEACHER: only assigned classes */
classesRouter.get('/', async (req, res) => {
  const userId = req.user!.id
  const role = req.role

  let query = adminClient.from('classes').select('*').order('name')

  if (role === 'TEACHER') {
    // Only classes the teacher is assigned to
    const { data: ta } = await adminClient
      .from('teacher_assignments')
      .select('class_id')
      .eq('teacher_id', userId)

    const classIds = ta?.map(r => r.class_id) ?? []
    if (classIds.length === 0) {
      res.json([])
      return
    }
    query = query.in('id', classIds)
  }

  const { data, error } = await query

  if (error) {
    res.status(500).json({ error: 'Failed to fetch classes' })
    return
  }

  res.json(data)
})

/** POST /classes — ADMIN only */
classesRouter.post(
  '/',
  requireRole(['ADMIN']),
  async (req, res) => {
    const parsed = createClassBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body' })
      return
    }

    const { data, error } = await adminClient
      .from('classes')
      .insert({ ...parsed.data, created_by: req.user!.id })
      .select()
      .single()

    if (error) {
      res.status(500).json({ error: 'Failed to create class' })
      return
    }

    res.status(201).json(data)
  },
)

/** DELETE /classes/:id — ADMIN only */
classesRouter.delete(
  '/:id',
  requireRole(['ADMIN']),
  async (req, res) => {
    const { error } = await adminClient
      .from('classes')
      .delete()
      .eq('id', req.params.id)

    if (error) {
      res.status(500).json({ error: 'Failed to delete class' })
      return
    }

    res.status(204).send()
  },
)
