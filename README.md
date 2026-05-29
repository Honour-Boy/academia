# Academia

> A secure, mobile-first grading platform for Nigerian secondary schools.
> Teachers grade, admins manage, **students are locked out at every layer** —
> by design.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm--Noncommercial--1.0.0-blue.svg)](./LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Backend: Express + TypeScript](https://img.shields.io/badge/backend-Express%20%2B%20TS-3178C6?logo=typescript)](https://expressjs.com)
[![Database: Supabase Postgres](https://img.shields.io/badge/database-Supabase-3ECF8E?logo=supabase)](https://supabase.com)

---

## What this is

A purpose-built grading and reporting system for a Nigerian secondary
school's staff console. Teachers enter scores, class teachers handle
attendance and behaviour remarks, admins manage staffing and produce
WAEC-style report sheets — all from a mobile-first interface built around
the realities of how Nigerian schools actually operate (terms, arms,
JSS → SS promotions, the WAEC 9-grade scale).

The whole system is built on a single non-negotiable security principle:
**a student should never be able to read, write, or infer any grade data**,
even with developer tools open or a stolen network request. That principle
shows up in every layer.

## Security model

Three layers enforce the same rule simultaneously:

| Layer | What enforces it |
|---|---|
| **Database** | Postgres RLS policies on every grade-related table. `auth.jwt() ->> 'role' IN ('TEACHER','ADMIN')` — no role claim returns zero rows. Subject teachers see only students for classes they teach. |
| **API** | Express middleware: `requireAuth` (valid Clerk JWT) → `requireRole(['TEACHER','ADMIN'])` on every grade route. 403s leak no body detail. |
| **Frontend** | No `/students/*` routes exist. Grade data is **never** persisted to `localStorage` or long-lived cache keys. Server-component checks redirect non-staff away before render. |

There is no `STUDENT` role anywhere in the schema. There is no student-facing
UI. Students are not a user type; they are metadata that staff manage.

Additional guardrails:

- **Audit log on every grade write** — `grade_audit_log` captures who/what/when/old/new for INSERT and UPDATE.
- **Per-year view-only mode** — when admin browses past academic years, every year-scoped mutation is server-side blocked.
- **Session management** — rolling inactivity timer (30 min teachers, 15 min admins) with countdown warning, cross-tab sync via BroadcastChannel, JWT re-auth required for password change, "sign out everywhere" + per-session view on `/profile`.
- **No grade optimistic UI** — every grade write is confirmed server-round-trip before the cell shows the new value. A failed write that looks successful is treated as a data integrity issue.
- **Exports are admin-gated** — class teachers can download their own class's PDF report ZIP; everything else requires ADMIN.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui primitives |
| Backend | Node.js, Express, TypeScript, Zod, pdfkit, archiver |
| Database | Supabase (Postgres 17 + RLS), service-role + anon-key client split |
| Auth | Supabase Auth — email/password + Google OAuth, with admin approval queue for self-registered staff |
| Caching | React Query (client), Next.js `revalidatePath('/', 'layout')` for cross-page invalidation after settings changes |
| Deployment | Vercel (frontend) + Render (backend), staging-first via a `staging` branch that's promoted manually |

## Architecture

```
academia/
├── frontend/                  Next.js — staff console (admin + teacher)
│   ├── app/(auth)/            sign-in, register wizard, password recovery
│   ├── app/(app)/             role-gated app routes
│   │   ├── admin/             approvals, teachers, classes, students, assignments,
│   │   │                       reports, audit, settings (term/year, year archives,
│   │   │                       year rollover wizard)
│   │   ├── class-teacher/     attendance + behaviour + remarks sheet
│   │   ├── grades/            subject teacher score entry grid
│   │   ├── dashboard/         personalised cards by role + class teacher status
│   │   ├── profile/           shared name/phone/password + active sessions + subject-change request
│   │   └── reports/           single-student report sheet preview
│   ├── components/            session guard, dialog, combobox, lottie, brand chrome
│   └── lib/                   school-settings, year-archives, promotion logic,
│                               name-uniqueness, supabase server/client factories
├── backend/                   Express — PDF generation, ZIP export, year-archive export
│   └── src/{routes,middleware,templates,lib}
├── supabase/migrations/       008 migrations — schema + RLS + triggers
└── render.yaml                two Render services (prod + staging)
```

## Notable features

### Bulk operations everywhere

- **Assignment matrix**: pick a teacher, get a subject × class grid, tick the cells, apply all in one chunked transaction. Add and Edit modes, with subject filtering by what the teacher actually registered to teach.
- **Class teacher matrix**: assign-all bar that saves every dirty row in one call; already-assigned teachers hide from other class dropdowns.
- **Student enrolment**: paste pipe-separated rows or upload CSV/Excel; per-row preview with class + subject matching, per-row skip reasons.
- **Year rollover wizard**: lists every active student grouped by class, auto-suggests promotion by level (JSS 1→2→3→SS 1→2→3→graduate), per-student override (promote/repeat/graduate/leave), atomic apply.

### Year-history

- **Past years are first-class.** Switch the school's active year backward to browse — every page renders that year's data in view-only mode with a sticky banner.
- **Export → delete.** Per-year ZIP of CSVs (grades, assignments, remarks). Delete with typed-confirmation when storage gets tight.

### Self-service for staff

- **Self-registration** → admin approval queue. Staff pick email/password OR Google.
- **Profile page** for both roles: edit name (with duplicate-name check), phone, password (with re-auth), see and revoke active sessions.
- **Subject-change requests** — teachers propose changes to their subject list; admin reviews diff (additions/removals/keeping) on `/admin/approvals`.

### Branding

Custom palette extracted from the school's own PDF report template
(crimson, gold, navy). Mobile-first chrome, sticky branded headers,
Lottie celebrations on grade completion, the works.

## Status

Live in production for one school, actively iterated on. Built solo;
schema, RLS, frontend, backend, and deploys are all in this repo.

## License

[**PolyForm Noncommercial 1.0.0**](./LICENSE) — anyone can read, study,
modify, and share the code for non-commercial purposes (portfolio review,
learning, research). Commercial use — including deploying it for a school —
requires a separate license. Contact below.

## Contact

Honour Adewunmi · [github.com/Honour-Boy](https://github.com/Honour-Boy) ·
ourgptforschool@gmail.com
