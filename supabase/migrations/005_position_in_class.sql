-- 005_position_in_class.sql
-- Adds a `position` column to `student_remarks` so the bulk report generator
-- can persist class rank per student per term. Single-student PDFs read this
-- value as-is; it is recomputed every time POST /reports/bulk runs for the
-- containing class.
--
-- Position is 1-based (1 = top of class) and must be NULL or positive.
-- Idempotent: safe to re-run.

ALTER TABLE student_remarks
  ADD COLUMN IF NOT EXISTS position INTEGER
  CHECK (position IS NULL OR position > 0);

COMMENT ON COLUMN student_remarks.position IS
  '1-based class rank for the term, computed by POST /reports/bulk. NULL when bulk has not been run for the containing class.';
