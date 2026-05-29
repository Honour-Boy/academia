import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import type { Request } from 'express'

/**
 * Returns a per-user (or per-IP fallback) rate-limit key. requireAuth has
 * already run by the time these limiters fire, so req.user.id is the right
 * cohort — a school behind a single NAT shouldn't have one student's brute
 * force lock everyone out.
 *
 * Uses express-rate-limit's `ipKeyGenerator` for the IP fallback path so
 * IPv6 addresses don't bypass the limiter by virtue of unique suffix bits.
 */
function userOrIpKey(req: Request): string {
  const userId = req.user?.id
  if (userId) return `user:${userId}`
  return `ip:${ipKeyGenerator(req.ip ?? '')}`
}

const RFC_HEADERS = { standardHeaders: 'draft-7', legacyHeaders: false } as const

/**
 * Grade writes — `/grades/:id` PUT and any other endpoint that ingests a
 * grade payload. 120 requests / minute / user gives a class teacher
 * comfortable headroom for the per-cell auto-save (~3 cells × 35 students
 * per minute when scrubbing through a sheet) while throttling a tampered
 * client that's looping.
 */
export const gradeWriteLimiter = rateLimit({
  windowMs: 60 * 1_000,
  limit: 120,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many grade writes — slow down and try again in a moment.' },
  ...RFC_HEADERS,
})

/**
 * Heavy endpoints — bulk reports + admin CSV / ZIP exports. These spool
 * megabytes per response, so even a low cap protects the worker from a
 * sustained flood. 12 per 5 minutes per user (≈ one full-class generation
 * every ~25 s) is well above legitimate usage.
 */
export const heavyExportLimiter = rateLimit({
  windowMs: 5 * 60 * 1_000,
  limit: 12,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many exports — wait a few minutes and try again.' },
  ...RFC_HEADERS,
})

/**
 * Default cap for the rest of the API. Loose enough not to interfere with
 * normal use, strict enough to slow down a script enumerating IDs.
 */
export const defaultApiLimiter = rateLimit({
  windowMs: 60 * 1_000,
  limit: 600,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many requests — please wait a moment.' },
  ...RFC_HEADERS,
})
