-- ─────────────────────────────────────────────────────────────────────────────
-- 011_grading_scale_and_report_fields.sql
--
-- Two admin-configurable settings surfaces:
--
--   1. `grading_scale` — one row per letter (A1, B2, …). Each row carries the
--      MINIMUM percentage that earns that letter. The upper bound is implicit
--      (the next-lower letter's min minus 1). Seeded with the existing
--      hard-coded WAEC defaults so behaviour is unchanged until an admin
--      edits the table.
--
--   2. `report_field_settings` — single row (CHECK id=1) toggling which
--      computed fields appear on student report sheets. Calculated at PDF
--      generation time so flipping a toggle is instant.
--
-- Both tables: ADMIN full write, every authed user can read. RLS enabled.
-- Idempotent — uses IF NOT EXISTS and ON CONFLICT DO NOTHING for seeds.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── grading_scale ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.grading_scale (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  letter       text        NOT NULL UNIQUE,
  min_percentage integer   NOT NULL CHECK (min_percentage BETWEEN 0 AND 100),
  description  text,
  sort_order   integer     NOT NULL,
  updated_by   uuid REFERENCES public.profiles(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sort_order)
);

ALTER TABLE public.grading_scale ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grading_scale_admin_all ON public.grading_scale;
CREATE POLICY grading_scale_admin_all ON public.grading_scale
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

DROP POLICY IF EXISTS grading_scale_authed_read ON public.grading_scale;
CREATE POLICY grading_scale_authed_read ON public.grading_scale
  FOR SELECT TO authenticated USING (true);

-- Seed the existing WAEC defaults. sort_order DESC so A1 is the "top" letter.
-- The min_percentage values match the hard-coded values that lived in
-- frontend/lib/grade-utils.ts before this migration.
INSERT INTO public.grading_scale (letter, min_percentage, description, sort_order) VALUES
  ('A1', 75, 'Excellent',         1),
  ('B2', 70, 'Very Good',         2),
  ('B3', 65, 'Good',              3),
  ('C4', 60, 'Credit',            4),
  ('C5', 55, 'Credit',            5),
  ('C6', 50, 'Pass',              6),
  ('D7', 45, 'Pass',              7),
  ('E8', 40, 'Pass',              8),
  ('F9',  0, 'Fail',              9)
ON CONFLICT (letter) DO NOTHING;

-- ── report_field_settings ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.report_field_settings (
  id                       integer PRIMARY KEY CHECK (id = 1),
  show_class_average       boolean NOT NULL DEFAULT true,
  show_class_highest       boolean NOT NULL DEFAULT true,
  show_position            boolean NOT NULL DEFAULT true,
  show_previous_terms      boolean NOT NULL DEFAULT true,
  updated_by               uuid REFERENCES public.profiles(id),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_field_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfs_admin_all ON public.report_field_settings;
CREATE POLICY rfs_admin_all ON public.report_field_settings
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

DROP POLICY IF EXISTS rfs_authed_read ON public.report_field_settings;
CREATE POLICY rfs_authed_read ON public.report_field_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.report_field_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.grading_scale IS
  'Admin-editable letter grades. Letter A1 has the highest sort_order=1 (printed first) and the highest min_percentage. The implicit upper bound for a row is the next-lower (higher sort_order) row''s min_percentage minus 1.';
COMMENT ON TABLE public.report_field_settings IS
  'Single-row config of which computed fields appear on student report sheets. Recomputed at PDF generation time so flipping a flag is instant.';
