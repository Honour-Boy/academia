# Handoff

_Last updated: 2026-05-28_

---

## Goal

**Academia** — a secure, mobile-first grading platform for Nigerian secondary schools.
Students are locked out at every layer (DB RLS, API, frontend). Two distinct teacher roles (Subject Teacher, Class Teacher) each have scoped access. Admins manage everything.

---

## Architecture

```
academia/
├── frontend/         Next.js 14 App Router + Supabase SSR + Tailwind + shadcn/ui
├── backend/          Express 4 + TypeScript (PDF generation, ZIP export, REST API)
├── supabase/
│   └── migrations/   Applied via supabase db push
└── render.yaml       Two Render services (prod + staging), autoDeploy: false
```

**Hosting**
- Frontend → Vercel (production=main, preview=staging)
- Backend  → Render (academia-backend=main, academia-backend-staging=staging)
- Both deploy only after the `deploy-gate` CI job passes

**Live Supabase project**: `https://kjjadbwhjiyjhdwnijwf.supabase.co`

---

## Database Schema (as of migration 003)

### Tables

| Table | Purpose |
|---|---|
| `profiles` | Extends `auth.users`; holds `role` (ADMIN \| TEACHER) and `is_active` |
| `classes` | JSS/SS arms e.g. "JSS 2A" |
| `subjects` | Subject catalogue (13 seeded on migration 001) |
| `teacher_assignments` | Subject teacher → class × subject (per term/year) |
| `class_teacher_assignments` | **NEW** Class teacher → class (one per class per term/year) |
| `students` | Student metadata only — no auth account |
| `student_subjects` | **NEW** Which subjects each student is enrolled in |
| `score_components` | CA1=20, CA2=20, Exam=60 |
| `grades` | Score per student × subject × component × term/year |
| `grade_audit_log` | Immutable log of every grade INSERT/UPDATE |
| `student_remarks` | **NEW** Class-teacher-owned: attendance + behaviour + remarks per term |

### Key Relationships
```
profiles (TEACHER) ──┬── teacher_assignments ──── classes × subjects
                     └── class_teacher_assignments ── classes

students ──── class_id ──── classes
students ──── student_subjects ──── subjects
students ──── student_remarks (entered by class teacher)
students ──── grades (entered by subject teachers)
```

### RLS Rules (summary)
- `grades`: subject teacher can read/write only for their assigned class+subject
- `student_remarks`: class teacher can write only for their assigned class
- `student_subjects`: ADMIN writes; TEACHER reads
- `grade_audit_log`: ADMIN full access; TEACHER reads own entries only
- No `anon` or unroled access on any grade-related table — ever

---

## Role Workflows

### ADMIN
- Create/deactivate teacher accounts (via Supabase Admin API, no self-reg)
- Create classes
- Assign class teachers → `/admin/classes`
- Assign subject teachers → `/admin/assignments`
- Enroll students + select subject offerings → `/admin/students/new`
- Edit student enrolment → `/admin/students/[id]`
- Download PDF report sheets & bulk ZIP → `/admin/reports`
- View grade audit log

### Subject Teacher
- Dashboard shows their subject assignment cards
- Grade entry (`/grades/[classId]/[subjectId]`):
  - Sees **only** students enrolled in that specific subject (via `student_subjects`)
  - Falls back to all class students if no enrolment records yet (backward compat)
  - Can edit scores only for their subject column

### Class Teacher
- Dashboard shows a blue "Class Teacher" card for their class
- Class Teacher Sheet (`/class-teacher/[classId]`):
  - Attendance: times present / absent / late
  - Behaviour rating: Excellent → Poor
  - Free-text remark (max 500 chars)
  - **Cannot see or edit any subject scores**

---

## Pages

| Route | Who | What |
|---|---|---|
| `/login` | All | Supabase email/password sign-in |
| `/dashboard` | ALL | Subject cards + Class Teacher cards |
| `/grades/[classId]/[subjectId]` | TEACHER / ADMIN | Score entry, filtered by subject enrolment |
| `/class-teacher/[classId]` | Class Teacher / ADMIN | Attendance, behaviour, remarks |
| `/reports/[studentId]` | ADMIN | Student report sheet preview |
| `/admin` | ADMIN | Dashboard: stats + quick actions |
| `/admin/teachers` | ADMIN | List, deactivate/reactivate |
| `/admin/teachers/new` | ADMIN | Create teacher account |
| `/admin/classes` | ADMIN | Assign class teachers per arm |
| `/admin/students` | ADMIN | List all students |
| `/admin/students/new` | ADMIN | Enroll student + select subjects |
| `/admin/students/[id]` | ADMIN | Edit student details + subjects |
| `/admin/assignments` | ADMIN | Assign subject teachers → class × subject |
| `/admin/reports` | ADMIN | Students by class; preview + download PDF report |
| `/admin/audit` | ADMIN | Read-only grade audit log (last 200) |

---

## Backend API

Base URL set via `NEXT_PUBLIC_BACKEND_URL` env var.

| Method + Path | Auth | Purpose |
|---|---|---|
| `GET /health` | None | Render health check |
| `GET /grades?classId=&subjectId=` | TEACHER/ADMIN | List grades |
| `PUT /grades/:id` | TEACHER/ADMIN | Update grade (teacher-scoped) |
| `GET /classes` | TEACHER/ADMIN | List classes (teacher sees own) |
| `POST /classes` | ADMIN | Create class |
| `GET /students?classId=&subjectId=` | TEACHER/ADMIN | List students |
| `POST /students` | ADMIN | Enrol student + subjects |
| `PATCH /students/:id` | ADMIN | Update student |
| `PUT /students/:id/subjects` | ADMIN | Replace subject enrolment |
| `GET /reports/student/:id?term=&year=` | ADMIN | Stream single PDF |
| `POST /reports/bulk` | ADMIN | Stream ZIP of multiple PDFs |
| `GET /admin/teachers` | ADMIN | List teachers |
| `POST /admin/teachers` | ADMIN | Create teacher |
| `PATCH /admin/teachers/:id/deactivate` | ADMIN | Deactivate |
| `GET /admin/assignments` | ADMIN | List subject assignments |
| `POST /admin/assignments` | ADMIN | Create subject assignment |
| `DELETE /admin/assignments/:id` | ADMIN | Remove assignment |
| `GET /admin/audit` | ADMIN | Grade audit log |

---

## Template / PDF System

- `backend/src/templates/types.ts` — `TemplateField`, `TemplateSection`, `KNOWN_FIELD_KEYS`
- `backend/src/templates/parser.ts` — Sanitises any template object; unknown keys are omitted without crashing; `defaultTemplate()` used when no custom template provided
- `backend/src/templates/generator.ts` — pdfkit-based PDF; sections: student info, subject scores table, overall, attendance, remarks, footer
- `POST /reports/bulk` — collects all PDFs into a `archiver` ZIP; each file named `First_Last_Report_Sheet.pdf`

To use a school-specific template: place a `ReportTemplate`-shaped JSON in the request body or load it from a file, pass through `parseTemplate()` first, then to `streamReportPDF()`.

---

## Environment Variables

### Frontend (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        ← sensitive, server-side only
NEXT_PUBLIC_BACKEND_URL          ← Render service URL
NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_SCHOOL_NAME
```

### Backend (Render)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
FRONTEND_ORIGIN                  ← comma-separated Vercel URLs for CORS
NODE_ENV
PORT
SCHOOL_NAME                      ← appears on PDF header
```

---

## CI / Deploy

```
push to staging → CI (frontend · backend · migrations · deploy-gate) → Vercel preview + Render staging
push to main    → same CI → Vercel production + Render production
PR              → CI only (no deploy)
```

GitHub Secrets needed (one-time setup):
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `RENDER_DEPLOY_HOOK_PROD`, `RENDER_DEPLOY_HOOK_STAGING`

---

## Pending Tasks

### Must-do before first real use
- [x] Run `supabase db push` to apply migration 003 — applied 2026-05-28 (003 now Local+Remote)
- [ ] Set `SCHOOL_NAME` env var in Render (shows on PDF header) — **user action**
- [ ] Set `NEXT_PUBLIC_BACKEND_URL` in Vercel — required for `/admin/reports` PDF download to work
- [ ] Enroll existing students via `/admin/students/new` with their subject selections — **user action**
- [ ] Assign class teachers in `/admin/classes`, subject teachers in `/admin/assignments` — **user action**
- [ ] Test PDF download: `/reports/student/:id?term=First+Term&year=2025/2026`
- [x] Add `<Toaster />` from sonner to `frontend/app/layout.tsx` — added (top-center, richColors)

### Admin pages still to build
- [x] `/admin/assignments` — subject teacher assignment UI (Supabase-direct + server actions)
- [x] `/admin/reports` — students by class, term/year filter, preview link + authed PDF download
- [x] `/admin/audit` — read-only grade audit log viewer (last 200, enriched with student/subject)

### Enhancements
- [ ] Upload a custom school PDF template → store as JSON in DB or file, pass to `parseTemplate()` before generating
- [ ] Principal remark field on admin report view (currently only class teacher remark is writable via UI)
- [ ] Position in class (rank) — compute at bulk report generation time, write back to `student_remarks`
- [ ] Export CSV of all grades (admin-only)
- [ ] `npm run dev` local test end-to-end (install deps first: `cd frontend && npm install`)
- [ ] Commit `frontend/package-lock.json` and switch Vercel back to `npm ci`

---

## Files in Flight

None — all changes committed on main + staging.

---

## Recent Changes

| Date | What |
|---|---|
| 2026-05-28 | Migration 003 pushed to live Supabase; built `/admin/assignments`, `/admin/reports`, `/admin/audit`; added sonner Toaster; frontend tsc + lint clean |
| 2026-05-27 | Supabase project created, migrations 001+002 applied, admin user created |
| 2026-05-27 | Vercel + Render deploy config; CI-driven deploy gates |
| 2026-05-27 | Migration 003: student_subjects, class_teacher_assignments, student_remarks |
| 2026-05-27 | Student enrolment UI (admin), Class Teacher daily sheet, PDF + ZIP export |
| 2026-05-27 | Dashboard: Class Teacher cards + Subject Teacher cards differentiated |
| 2026-05-27 | Grade entry: filters by student_subjects enrollment |
