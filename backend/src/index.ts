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

// Global error handler — swallow details in production
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (NODE_ENV !== 'production') {
      console.error(err)
    }
    res.status(500).send()
  },
)

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[academia-backend] listening on :${PORT} (${NODE_ENV})`)
})

export default app
