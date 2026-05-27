# Handoff

_Last updated: 2026-05-27_

## Goal

Build **Academia** — a secure, mobile-first grading platform for teachers and school admins. Students are completely locked out at every layer: the database (Supabase RLS rejects any JWT without a `TEACHER` or `ADMIN` role claim), the API (Server Actions require a valid session + role check), and the frontend (no student-facing routes exist). Teachers enter and manage grades for their own classes. Admins manage teachers, classes, and generate reports. UI is phone-first — grade entry is comfortable on mobile.

## Current State

**Full starting codebase written.** Ready for `npm install` and Supabase project setup.

### What exists now

| Path | What it does |
|------|-------------|
| `supabase/migrations/001_initial_schema.sql` | Complete DB schema, RLS policies, audit triggers |
| `frontend/` | Complete Next.js 14 App Router project |
| `frontend/middleware.ts` | Auth gate — unauthed requests → `/login` |
| `frontend/app/(auth)/login/` | Login page + Server Action |
| `frontend/app/(app)/layout.tsx` | Protected layout, deactivated-user guard |
| `frontend/app/(app)/dashboard/` | Teacher dashboard — class/subject assignment cards with progress bars |
| `frontend/app/(app)/grades/[classId]/[subjectId]/` | Grade entry: component tabs, auto-save on blur, offline draft in localStorage, Enter-key advances to next student |
| `frontend/app/(app)/reports/[studentId]/` | Student report sheet — all subjects, totals, percentages, WAEC grade letters |
| `frontend/app/(app)/admin/` | Admin dashboard with stats + quick-action links |
| `frontend/app/(app)/admin/teachers/` | Teacher list + deactivate/reactivate |
| `frontend/app/(app)/admin/teachers/new/` | Add teacher form (uses Supabase Admin API — no self-registration) |
| `frontend/components/grades/GradeEntryList.tsx` | Touch-friendly mobile grade entry with per-cell auto-save, validation, offline draft |
| `frontend/components/dashboard/ClassSubjectCard.tsx` | Assignment card with progress bar |
| `frontend/components/ui/NavBar.tsx` | Dark sidebar navbar |
| `frontend/components/ui/OfflineBanner.tsx` | "You're offline" amber banner |
| `frontend/lib/grade-utils.ts` | WAEC grade letter calc, class stats, score validation, term helpers |
| `frontend/lib/supabase/client.ts` + `server.ts` | Supabase SSR clients |

### Pages still to build (admin flows)
- `/admin/classes` — create/edit classes
- `/admin/students` — enroll students, edit class assignment
- `/admin/assignments` — assign teacher ↔ class ↔ subject
- `/admin/reports` — admin view of all report sheets
- `/admin/audit` — grade audit log viewer

## Files in Flight

None — initial build complete, nothing uncommitted.

## Recent Changes

- 2026-05-27 — Full starting codebase generated. DB migration, all core pages, grade entry component, admin panel foundation.

## Failed / Not Working

None yet — not yet wired to a live Supabase project.

## Next Steps

1. **Supabase project** — Create project at app.supabase.com, run `supabase db push` with the migration
2. **Environment** — Copy `frontend/.env.example` → `frontend/.env.local`, fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
3. **Install deps** — `cd frontend && npm install`
4. **Create first admin** — In Supabase dashboard → Authentication → Users → "Invite user", then manually set `role = 'ADMIN'` in the `profiles` table
5. **Test auth** — `npm run dev`, log in as admin, verify teacher login is blocked without account
6. **Build remaining admin pages** — Classes, Students, Assignments (see list above)
7. **Add sonner toast provider** — wrap `app/layout.tsx` with `<Toaster />` from `sonner`
8. **shadcn/ui init** — `npm run ui:add button input badge card table` for the component primitives
9. **Report template** — You'll provide the school report sheet layout; map it onto `/reports/[studentId]/page.tsx`
10. **Deploy** — Vercel for frontend, ensure `SUPABASE_SERVICE_ROLE_KEY` is in Vercel env (not public)
