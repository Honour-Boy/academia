# Academia — Secure Grading Platform

> A secure, mobile-first grading app for teachers and admins. Students are locked out at every layer — database, API, and UI.

This project follows the Engineering Bible at `@ENGINEERING_BIBLE.md`. Read it first.
Read `@handoff.md` for current state before starting any work.

---

## Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui
- **Backend:** Node.js + Express + TypeScript, Zod schemas
- **Database:** Supabase (PostgreSQL + RLS)
- **Auth:** Clerk → Supabase JWT
- **Client cache:** React Query (TanStack Query)
- **Server cache / queues:** Redis (only if needed)
- **Deployment:** Vercel (frontend) + Coolify on Oracle VM (backend)

---

## Commands

```bash
# Frontend (from /frontend)
doppler run -- npm run dev

# Backend (from /backend)
doppler run -- npm run dev

# Tests
doppler run -- npm test

# Lint
npm run lint

# Database migrations
supabase migration new <name>
supabase db push  # staging first, always

# FORGE scan before push
vibe2prod scan .
```

---

## Project Structure

```
academia/
├── frontend/                  # Next.js
│   ├── app/
│   │   ├── (auth)/            # Clerk sign-in / sign-up
│   │   ├── dashboard/         # Teacher home — class list, recent activity
│   │   ├── classes/[id]/      # Class detail — student roster + grade entry
│   │   ├── admin/             # Admin-only: manage teachers, classes, reports
│   │   └── layout.tsx
│   ├── components/
│   │   ├── grades/            # GradeCell, GradeTable, GradeSheet
│   │   ├── classes/           # ClassCard, ClassList
│   │   └── ui/                # shadcn/ui re-exports + custom primitives
│   ├── lib/
│   │   ├── auth.ts            # Clerk helpers + role guards
│   │   └── api.ts             # Typed fetch wrappers
│   └── .env.example
├── backend/                   # Express + TypeScript
│   ├── src/
│   │   ├── routes/
│   │   │   ├── grades.ts      # CRUD — TEACHER + ADMIN only
│   │   │   ├── classes.ts     # class management
│   │   │   └── admin.ts       # admin-only endpoints
│   │   ├── middleware/
│   │   │   ├── requireAuth.ts # verifies Clerk JWT — rejects all else
│   │   │   └── requireRole.ts # TEACHER | ADMIN gate — hard 403 otherwise
│   │   ├── schemas/           # Zod schemas
│   │   └── index.ts
│   └── .env.example
├── supabase/
│   └── migrations/            # RLS policies live here
├── CLAUDE.md                  # this file
├── handoff.md                 # living project state
└── docker-compose.yml
```

---

## Mobile responsiveness

- **Approach:** mobile-first — all grade entry UI designed for a phone first, scaled up to tablet/desktop
- Grade entry on mobile uses a tap-friendly full-width row, not a dense spreadsheet grid
- See `@docs/mobile-responsiveness.md` for breakpoints and required QA

---

## Security model — READ THIS BEFORE TOUCHING ANY GRADE DATA

This is the most important section. The entire threat model is: **students must never read, write, or infer any grade data.**

### Roles
- `ADMIN` — full access: manage teachers, classes, students (metadata only), run reports, export data
- `TEACHER` — scoped access: read/write grades only for classes they own
- **There is no `STUDENT` role.** If you find yourself adding one, stop and ask why.

### Layers of enforcement (all three must hold simultaneously)

1. **Database (Supabase RLS)**
   - Every grade-related table has RLS enabled — `ALTER TABLE grades ENABLE ROW LEVEL SECURITY`
   - `SELECT` policy: `auth.jwt() ->> 'role' IN ('TEACHER', 'ADMIN')` — no role claim = no rows returned
   - `UPDATE`/`INSERT` policy: teacher can only write rows where `class.teacher_id = auth.uid()`
   - Admin can read/write all rows
   - No `anon` or `authenticated` (without role) policies on grade tables — ever

2. **API (Express middleware)**
   - Every route is behind `requireAuth` (valid Clerk JWT) then `requireRole(['TEACHER','ADMIN'])`
   - Routes return `403` with no body detail on failure — never leak which resource exists
   - No grade data in error messages, logs shipped to external services, or response headers

3. **Frontend (Next.js)**
   - No `/students/*` routes exist — there is no student-facing UI
   - Clerk `auth()` checked in every Server Component that touches grade data
   - Grade data is **never** written to `localStorage`, `sessionStorage`, or long-lived React Query cache keys that survive page reload
   - React Query cache is cleared on sign-out

### What "bulletproof" means in practice
- A tech-savvy student with DevTools open cannot: replay a network request to read grades (no valid JWT), manipulate a DOM value to change a grade (all writes go server-side), or find grade data in browser storage
- A student who steals a teacher's session token is a different threat — handled by Clerk's session management and short-lived JWTs (1hr max)

---

## Project-specific overrides

- **No optimistic UI for grade writes** — grades must be confirmed server-round-trip before the cell shows the new value. A failed write that looks successful is a data integrity issue.
- **Audit log required** — every `INSERT`/`UPDATE` on `grades` writes a row to `grade_audit_log` (who, what, when, old value, new value). This is non-negotiable.
- **Export is admin-only** — CSV/PDF grade exports are gated to `ADMIN` role. Teachers see grades on screen only.

---

## References (loaded on demand)

- `@ENGINEERING_BIBLE.md` — canonical rules
- `@handoff.md` — current project state
- `@docs/ui-standards.md` — skeleton loaders, optimistic UI, tooltips
- `@docs/caching.md` — React Query + Redis rules
- `@docs/backend-security.md` — auth, pagination, safe errors
- `@docs/mobile-responsiveness.md` — breakpoints, QA checklist
- `@docs/observability.md` — Sentry, PostHog, alert routing
- `@docs/agent-behavior.md` — think-before-coding, simplicity, surgical changes
- `@docs/handoff-protocol.md` — how to update handoff.md
