-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: year_archives
--
-- Registry of academic_year values that have ever held data. Drives:
--   (a) The year picker on admin pages (audit, assignments, classes, reports) —
--       lets the admin browse past years in view-only mode.
--   (b) The wizard's "backward to existing year" path — switching to a past
--       year that has records is allowed (no promotion needed); switching to
--       a year that has no records is rejected.
--   (c) The /admin/settings year-archives section — per-year export + delete.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS year_archives (
  academic_year   TEXT        PRIMARY KEY,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill from every year-scoped table. UNION DISTINCT collapses duplicates.
INSERT INTO year_archives (academic_year)
SELECT academic_year FROM teacher_assignments
UNION
SELECT academic_year FROM class_teacher_assignments
UNION
SELECT academic_year FROM grades
UNION
SELECT academic_year FROM student_remarks
UNION
SELECT current_academic_year FROM school_settings
ON CONFLICT (academic_year) DO NOTHING;

-- RLS: ADMIN full access (read + write); TEACHER read-only (the year filter
-- on teacher-side pages is a future enhancement; safe to expose now).
ALTER TABLE year_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "year_archives:admin" ON year_archives;
CREATE POLICY "year_archives:admin" ON year_archives FOR ALL
  USING (get_my_role() = 'ADMIN')
  WITH CHECK (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS "year_archives:read_authed" ON year_archives;
CREATE POLICY "year_archives:read_authed" ON year_archives FOR SELECT
  TO authenticated USING (TRUE);
