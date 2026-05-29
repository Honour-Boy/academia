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
      .select('role, is_active, status, deleted_at')
      .eq('id', req.user.id)
      .single()

    // Belt-and-braces: pending / denied users have is_active=false per the
    // handle_new_user trigger, so the is_active check below would already
    // reject them. We also explicitly require status='approved' so a row
    // whose is_active was toggled directly in the DB (without going through
    // the approval flow) can't pivot to API access. Soft-deleted profiles
    // (deleted_at) are likewise rejected so a stale token can't outlive the
    // delete action.
    if (
      error
      || !data
      || !data.is_active
      || data.status !== 'approved'
      || data.deleted_at
    ) {
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
