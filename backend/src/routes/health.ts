import { Router } from 'express'

export const healthRouter = Router()

/**
 * GET /health
 * Used by Render for health checks. No auth required.
 */
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'academia-backend',
    timestamp: new Date().toISOString(),
  })
})
