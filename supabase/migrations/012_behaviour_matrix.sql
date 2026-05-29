-- ─────────────────────────────────────────────────────────────────────────────
-- 012_behaviour_matrix.sql
--
-- Behavioural-activity scoring matrix.
--
--   behaviour_activities          admin-edited catalogue of activities
--                                 (Punctuality, Neatness, Initiative, …).
--                                 Single school-wide set; rows are soft-
--                                 disabled via is_active so historical scores
--                                 don't break when the admin retires a field.
--
--   student_behaviour_scores      per (student × activity × term × year)
--                                 score on a 1–5 scale. Class teachers fill
--                                 these in via /class-teacher/[classId] for
--                                 their assigned class; admins can edit any.
--
-- Both tables: ADMIN full access. Class teachers can read/write scores for
-- students in classes they currently class-teach. Every other authed user can
-- read the catalogue + scores (subject teachers see remarks for context).
--
-- Idempotent — IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.behaviour_activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  description  text,
  sort_order   integer     NOT NULL,
  is_active    boolean     NOT NULL DEFAULT true,
  updated_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sort_order)
);

ALTER TABLE public.behaviour_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS behaviour_activities_admin_all ON public.behaviour_activities;
CREATE POLICY behaviour_activities_admin_all ON public.behaviour_activities
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

DROP POLICY IF EXISTS behaviour_activities_authed_read ON public.behaviour_activities;
CREATE POLICY behaviour_activities_authed_read ON public.behaviour_activities
  FOR SELECT TO authenticated USING (true);

-- Seed the default 17 activities listed by the user. Sort order matches the
-- order they wrote them.
INSERT INTO public.behaviour_activities (name, sort_order) VALUES
  ('Punctuality',                 1),
  ('Class Attendance',            2),
  ('Carrying of Assignments',     3),
  ('Neatness',                    4),
  ('Politeness',                  5),
  ('Relationship with Staff',     6),
  ('Relationship with Students',  7),
  ('Attractiveness',              8),
  ('Initiative',                  9),
  ('Emotional Stability',        10),
  ('Attentiveness',              11),
  ('Attitude to Study',          12),
  ('Attitude to Property',       13),
  ('Clubs & Societies',          14),
  ('Careers & Sports',           15),
  ('Manual Skill',               16),
  ('Manufacturing',              17)
ON CONFLICT (sort_order) DO NOTHING;

-- ─── student_behaviour_scores ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_behaviour_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  activity_id     uuid NOT NULL REFERENCES public.behaviour_activities(id) ON DELETE CASCADE,
  term            text NOT NULL,
  academic_year   text NOT NULL,
  score           smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  entered_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, activity_id, term, academic_year)
);

CREATE INDEX IF NOT EXISTS sbs_student_term_year_idx
  ON public.student_behaviour_scores (student_id, term, academic_year);

ALTER TABLE public.student_behaviour_scores ENABLE ROW LEVEL SECURITY;

-- ADMIN — full access.
DROP POLICY IF EXISTS sbs_admin_all ON public.student_behaviour_scores;
CREATE POLICY sbs_admin_all ON public.student_behaviour_scores
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

-- Class teachers — read + write scores for students in classes they
-- currently class-teach. The CTA row is checked dynamically so reassigning
-- a class teacher rolls access cleanly.
DROP POLICY IF EXISTS sbs_class_teacher_write ON public.student_behaviour_scores;
CREATE POLICY sbs_class_teacher_write ON public.student_behaviour_scores
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.class_teacher_assignments cta
        ON cta.class_id = s.class_id
      WHERE s.id = student_behaviour_scores.student_id
        AND cta.teacher_id = auth.uid()
        AND cta.term = student_behaviour_scores.term
        AND cta.academic_year = student_behaviour_scores.academic_year
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.class_teacher_assignments cta
        ON cta.class_id = s.class_id
      WHERE s.id = student_behaviour_scores.student_id
        AND cta.teacher_id = auth.uid()
        AND cta.term = student_behaviour_scores.term
        AND cta.academic_year = student_behaviour_scores.academic_year
    )
  );

-- Subject teachers reading a student's behaviour gives them no edge they
-- don't already have via grades. Keep reads open to all authed users so the
-- report-preview surfaces can show them.
DROP POLICY IF EXISTS sbs_authed_read ON public.student_behaviour_scores;
CREATE POLICY sbs_authed_read ON public.student_behaviour_scores
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.behaviour_activities IS
  'Admin-edited list of behavioural activities (Punctuality, Neatness, …). Soft-disable via is_active to retire a field without losing historical scores.';
COMMENT ON TABLE public.student_behaviour_scores IS
  'Per (student × activity × term × academic_year) score on a 1–5 scale. 5 = Very Good, 4 = Good, 3 = Fair, 2 = Weak, 1 = Poor.';
