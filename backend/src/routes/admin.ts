import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth'
import { requireRole } from '../middleware/requireRole'
import { adminClient } from '../lib/supabase'

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
  teacher_id: z.string().uuid(),
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  term: z.string().min(1),
  academic_year: z.string().min(1),
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

/** PATCH /admin/teachers/:id/deactivate */
adminRouter.patch('/teachers/:id/deactivate', async (req, res) => {
  const { error } = await adminClient
    .from('profiles')
    .update({ is_active: false })
    .eq('id', req.params.id)

  if (error) {
    res.status(500).json({ error: 'Failed to deactivate teacher' })
    return
  }

  res.status(204).send()
})

/** PATCH /admin/teachers/:id/reactivate */
adminRouter.patch('/teachers/:id/reactivate', async (req, res) => {
  const { error } = await adminClient
    .from('profiles')
    .update({ is_active: true })
    .eq('id', req.params.id)

  if (error) {
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
  const { error } = await adminClient
    .from('teacher_assignments')
    .delete()
    .eq('id', req.params.id)

  if (error) {
    res.status(500).json({ error: 'Failed to delete assignment' })
    return
  }

  res.status(204).send()
})

// ─── Audit log ────────────────────────────────────────────────────────────────

/** GET /admin/audit?gradeId= — admin read-only view of audit entries */
adminRouter.get('/audit', async (req, res) => {
  let query = adminClient
    .from('grade_audit_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(500)

  if (req.query.gradeId) {
    query = query.eq('grade_id', req.query.gradeId as string)
  }

  const { data, error } = await query

  if (error) {
    res.status(500).json({ error: 'Failed to fetch audit log' })
    return
  }

  res.json(data)
})
