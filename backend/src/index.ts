import './types'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'

import { healthRouter } from './routes/health'
import { gradesRouter } from './routes/grades'
import { classesRouter } from './routes/classes'
import { studentsRouter } from './routes/students'
import { reportsRouter } from './routes/reports'
import { adminRouter } from './routes/admin'

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10)
const NODE_ENV = process.env.NODE_ENV ?? 'development'

// FRONTEND_ORIGIN is comma-separated (e.g. "https://academia.vercel.app,https://academia-staging.vercel.app")
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((o: string) => o.trim())

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express()

// Security headers
app.use(helmet())

// CORS — only allow configured frontend origins
app.use(
  cors({
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) {
      // Allow no-origin requests (same-origin, curl, health checks)
      if (!origin) return callback(null, true)
      // Allow exact match or Vercel preview URL prefix
      const allowed =
        allowedOrigins.includes(origin) ||
        allowedOrigins.some(
          (o: string) => o.startsWith('https://') && origin.endsWith('.vercel.app'),
        )
      if (allowed) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  }),
)

// Request logging — compact in production
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'))

// JSON body parsing
app.use(express.json({ limit: '1mb' }))

// Catch malformed JSON before it bubbles into the global error handler with a
// noisy stack — return a uniform 400 so we don't reveal parser internals.
app.use(
  (
    err: Error & { type?: string; status?: number },
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }
    next(err)
  },
)

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/health', healthRouter)
app.use('/grades', gradesRouter)
app.use('/classes', classesRouter)
app.use('/students', studentsRouter)
app.use('/reports', reportsRouter)
app.use('/admin', adminRouter)

// 404 fallthrough — no route leakage
app.use((_req, res) => {
  res.status(404).send()
})

// Global error handler — always logs server-side so prod incidents can be
// diagnosed; never leaks stack traces, query strings, or framework messages to
// the client.
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(
      `[error] ${req.method} ${req.path}`,
      err instanceof Error ? err.stack ?? err.message : err,
    )
    // CORS rejections are surfaced as Errors with "Not allowed by CORS" message
    // by the cors() origin callback. Treat those as 403 with no body — a
    // generic 500 would obscure the real cause for the operator.
    if (err?.message === 'Not allowed by CORS') {
      res.status(403).send()
      return
    }
    if (res.headersSent) return
    res.status(500).send()
  },
)

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[academia-backend] listening on :${PORT} (${NODE_ENV})`)
})

export default app
