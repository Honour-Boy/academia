import type { Request, Response, NextFunction } from 'express'
import { adminClient } from '../lib/supabase'

type AllowedRole = 'ADMIN' | 'TEACHER'

/**
 * After requireAuth, looks up the user's role from profiles.
 * Returns 403 (no body) if:
 *   - profile not found
 *   - account is deactivated
 *   - role is not in the allowed list
 *
 * Security note: 403 has no body — never leak which condition failed.
 */
export function requireRole(allowed: AllowedRole[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).send()
      return
    }

    const { data, error } = await adminClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', req.user.id)
      .single()

    if (error || !data || !data.is_active) {
      res.status(403).send()
      return
    }

    const role = data.role as AllowedRole
    if (!allowed.includes(role)) {
      res.status(403).send()
      return
    }

    req.role = role
    next()
  }
}
