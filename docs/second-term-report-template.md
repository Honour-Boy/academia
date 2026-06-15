# Second-Term Report Template — Implementation Plan

_Created: 2026-06-15. Owner: report-generation overhaul. Status: **awaiting approval / not yet started.**_

> **Why this doc exists:** the user supplied a fixed "MY DREAM COLLEGE" Second-Term
> report sheet (`backend/src/templates/report_sheet_template.pdf`) and wants generated
> reports to look **exactly** like it, with each student's real data dropped into the
> printed slots — sized to fill each slot without overflowing. This is a multi-part
> change touching the DB catalogue, the data layer, and PDF rendering, so it is broken
> into phases. **Each phase ships as its own PR into `staging`.** If a session ends
> mid-way, the next session resumes from the first unchecked phase below.

---

## Ground truth about the template

- File: `backend/src/templates/report_sheet_template.pdf`.
- It is a **single full-page JPEG** embedded on an A4-ish page. **No text layer, no
  AcroForm fields.** → We cannot "fill fields"; we must **draw text on top at
  absolute coordinates**.
- Page MediaBox: `594.3 × 840.51` pt. Embedded image: `2012 × 2936` px, DeviceRGB JPEG.
- Pixel→point conversion (image origin = top-left, PDF origin = bottom-left):
  ```
  x_pt = px * (594.3 / 2012)            // ≈ px * 0.29538
  y_pt = 840.51 - py * (840.51 / 2936)  // ≈ 840.51 - py * 0.28628
  ```
- Library: **`pdf-lib`** (pure JS, runs on the Oracle VM; loads the existing PDF and
  draws on its page). PDFKit stays for the First/Third-term path (Phase 4).

### Scope of the template (per user, 2026-06-15)

- **Second Term ONLY.** First-Term and Third-Term templates will be supplied later.
  Until then, those terms keep the existing from-scratch (PDFKit) report — but its
  layout is updated to resemble the Second-Term sheet "as much as possible" (Phase 4).
- The header "2ND TERMS 20___" is correct for this template; we only fill the trailing
  year digits. No term-switching on this template.

---

## Canonical catalogue changes (from the template)

### Subjects — flush to these 16 (exact names, used for row matching)

`MATHEMATICS`, `ENGLISH LANGUAGE`, `PHYSICS`, `CHEMISTRY`, `BIOLOGY`, `ECONOMICS`,
`FINANCIAL ACCOUNT`, `YORUBA`, `COMMERCE`, `FURTHER MATHEMATICS`, `MARKETING`,
`LITERATURE IN ENGLISH`, `GOVERNMENT`, `CIVIC EDUCATION`,
`CHRISTIAN RELIGIOUS STUDIES`, `AGRICULTURAL SCIENCE`.

- Replaces the current 13-subject seed (migration 001): English Language, Mathematics,
  Basic Science, Social Studies, Civic Education, Agricultural Science, Computer Studies,
  Business Studies, French, Fine Art, Physical & Health Education, Christian Religious
  Studies, Islamic Religious Studies.
- **The catalogue list must stay byte-for-byte aligned with the printed row labels** so
  subject→row matching is a simple case-insensitive name match. If a printed label is
  ever re-spelled, update the catalogue name to match.

### Behaviour activities — flush to these 15 (Part B printed rows)

`Punctuality`, `Class Attendance`, `Carrying of Assignment`, `Neatness`, `Politeness`,
`Relationship with Staff`, `Relationship with Students`, `Attentiveness`, `Initiative`,
`Emotional Stability`, `Attitude to Study`, `Attitude to Property`, `Clubs & Societies`,
`Games & Sports`, `Manual Skill`.

- Replaces migration 012's 17-row seed, which has names that don't match the sheet
  ("Carrying of Assignment**s**", "Attractiveness", "Careers & Sports", "Manufacturing").

---

## ⚠️ Destructive-migration warning (Phase 1)

`subjects` and `behaviour_activities` are referenced with **`ON DELETE CASCADE`** by:

- `student_subjects.subject_id` → deleting a subject removes student enrolments in it.
- `teacher_assignments.subject_id` → deleting a subject removes teacher assignments.
- `grades.subject_id` → **deleting a subject deletes all grade rows for it** (and their
  `grade_audit_log` rows cascade in turn).
- `student_behaviour_scores.activity_id` → deleting an activity removes its scores.

This is acceptable per the user ("entire flush and remodelling") **because staging has no
real Second-Term data yet**, but it is irreversible. **Migration must run on staging
first, and an export/backup of `grades`, `student_subjects`, `teacher_assignments`,
`behaviour_activities`, `student_behaviour_scores` must be taken before applying to prod.**
The migration keeps subjects whose names already match the new list (rename-in-place where
possible) to avoid needlessly cascading their data.

---

## Phases

> Convention: every phase = one PR into `staging` (per project workflow rule, never into
> `main`). Tick the box and record the PR number when merged.

### Phase 0 — This plan + handoff reference + commit the template asset
- [ ] Add this doc; reference it at the top of `handoff.md`.
- [ ] Commit the new `report_sheet_template.pdf` (and remove the obsolete
      `Project-report sheet.pdf`) so the renderer has its asset in-repo.
- [ ] PR → staging.

### Phase 1 — Catalogue remodel migration (subjects + behaviour activities)
> **Status 2026-06-15:** migration `015_second_term_catalogue.sql` **written**, but
> **NOT applied**. The Supabase project reachable via MCP (`kjjadbwhjiyjhdwnijwf`) is
> **empty** — 0 public tables, no `supabase_migrations` schema, `auth.users` = 0. It is
> not the staging/prod DB that holds real data; that project is not visible to this MCP
> account. **Blocked on the user:** point MCP at the real staging project (or confirm this
> empty project should be bootstrapped with migrations 001–015 to become staging).
- [ ] New migration `015_second_term_catalogue.sql`:
  - Upsert/rename `subjects` to the 16 template names; delete any not in the list
    (cascade caveat above). Prefer `UPDATE … WHERE name ILIKE old` to rename matches
    (e.g. keep "Christian Religious Studies", "Agricultural Science", "Civic Education")
    so their data survives.
  - Same treatment for `behaviour_activities` → the 15 names (fix the typo'd rows;
    soft-disable vs hard-delete — prefer **rename** where a 1:1 intent exists, else set
    `is_active = false` to preserve historical scores, then insert the missing ones).
- [ ] Clean up `student_subjects` rows pointing at removed subjects (cascade handles it,
      but verify no orphans; confirm affected student profiles reflect the new offering).
- [ ] Apply to **staging** via Supabase MCP; verify row contents.
- [ ] PR → staging. (Do **not** apply to prod until the user approves + backs up.)

### Phase 2 — Per-subject class position (data layer)
- [ ] Add per-subject ranking: for each subject in a class+term+year, rank active
      students by that subject's total (competition ranking, ties share rank), mirroring
      `recomputeAndPersistClassRank`'s tie logic.
- [ ] Surface as `SubjectScore.positionInClass: number | null` in
      `backend/src/templates/generator.ts` types and populate it in `buildReportData`
      (`reports.ts`). Compute in-memory from the class roster grades already fetched for
      class-average/highest where possible to avoid extra round-trips.
- [ ] PR → staging.

### Phase 3 — Second-Term template overlay renderer
- [ ] Add `pdf-lib` to `backend` deps.
- [ ] New module `backend/src/templates/secondTermOverlay.ts`:
  - Load `report_sheet_template.pdf`, get page 1.
  - A **coordinate map** (in image px, converted via the formula above) for every slot:
    header year; Name / Registration No / Sex; Class / Total Score; Number in class /
    Percentage / Class Position; Part A table cells per printed subject row × columns
    (CA1, CA2, Exam, Total, Class avg, Class highest, Grade, Position, 1st-term, sign);
    Part B activity rows × (1st term, 2nd term, Avg); footer (Days Open, Present, Absent,
    Form Master's Comments, School Fees, Next Term Commences, Head Teacher's Comments).
  - **Auto-fit text:** measure string width at a base size, shrink font until it fits the
    slot width (min floor), so values "fill the space without being too big or small".
  - **Subject rows:** match the student's offered subjects (`student_subjects`) to printed
    rows by case-insensitive name; **subjects not offered are left blank**.
  - **Behaviour rows:** match `behaviour_activities` to printed rows by name; "1st term"
    + "2nd term" columns from current/prior scores; "Avg" from the average.
  - **"1st term Score" subject column** = each subject's First-Term percentage (already
    available via the prior-terms data).
- [ ] Wire `reports.ts`: when `term === 'Second Term'` use the overlay renderer for both
      `GET /reports/student/:id` and `POST /reports/bulk`; otherwise keep `streamReportPDF`.
- [ ] Visual iteration loop: render a sample, compare against the blank template, nudge
      coordinates until aligned. (Use the JPEG extraction trick in this doc to eyeball.)
- [ ] PR → staging.

### Phase 4 — First/Third-term layout parity (PDFKit generator)
- [ ] Update `streamReportPDF` so the from-scratch report mirrors the Second-Term sheet
      "as much as possible": same column set in Part A (CA1/CA2/Exam/Total/Class avg/
      Class highest/Grade/Position/prev-term/sign), Part B behaviour table, and the footer
      comment lines. This keeps non-Second-Term reports visually consistent until their own
      templates arrive.
- [ ] PR → staging.

### Phase 5 — Footer/config fields with no current source
- [ ] "Total Number of Days School Open", "School Fees for Next Term", "Next Term
      Commences" have no DB source. Add them as configurable values (extend
      `school_settings` or a small per-term settings row) with **blank** as the safe
      default; "Days Present/Absent" already map to `student_remarks.times_present/absent`.
- [ ] Surface admin inputs where appropriate (e.g. `/admin/settings`).
- [ ] PR → staging.

---

## Open items / confirmations still useful

- **Behaviour-activity flush** assumed to mirror the subject flush (not explicitly
  confirmed by the user) — confirm before Phase 1 runs on prod.
- **Footer config fields** (Phase 5): confirm whether School Fees / Next Term Commences
  should be admin-entered per term, or always left blank.
- **Per-subject "teacher's sign"** column: left blank (no digital-signature feature).

---

## Verification checklist (per phase)

- `npx tsc --noEmit` clean (backend + frontend as applicable).
- `npm run lint` clean.
- Migrations applied + verified on **staging** via Supabase MCP before any prod talk.
- Phase 3/4: a rendered sample PDF eyeballed against the blank template for alignment.
