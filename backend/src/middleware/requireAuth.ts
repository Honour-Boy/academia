import type { Request, Response, NextFunction } from 'express'
import { adminClient } from '../lib/supabase'

/**
 * Verifies the Supabase JWT from Authorization: Bearer <token>.
 * Sets req.user on success; returns 401 with no body otherwise.
 *
 * Security note: never leak which token or resource caused the rejection.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    res.status(401).send()
    return
  }

  const {
    data: { user },
    error,
  } = await adminClient.auth.getUser(token)

  if (error || !user) {
    res.status(401).send()
    return
  }

  req.user = user
  next()
}
