-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Student-Subject enrollment + Class Teacher assignments
--                + Student Remarks (attendance, behaviour, remarks)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. class_teacher_assignments ─────────────────────────────────────────────
-- One class teacher per class per term/year.
-- Distinct from teacher_assignments (subject teachers).
CREATE TABLE class_teacher_assignments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id       UUID        NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  term           TEXT        NOT NULL DEFAULT 'First Term',
  academic_year  TEXT        NOT NULL DEFAULT '2025/2026',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Exactly ONE class teacher per class per term/year
  UNIQUE(class_id, term, academic_year)
);

CREATE INDEX idx_cta_teacher ON class_teacher_assignments(teacher_id);
CREATE INDEX idx_cta_class   ON class_teacher_assignments(class_id);

-- ── 2. student_subjects ───────────────────────────────────────────────────────
-- Which subjects each student is actually taking (set at enrolment time).
-- This drives: grade entry visibility, report sheet inclusion.
CREATE TABLE student_subjects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES students(id)  ON DELETE CASCADE,
  subject_id  UUID        NOT NULL REFERENCES subjects(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, subject_id)
);

CREATE INDEX idx_ss_student ON student_subjects(student_id);
CREATE INDEX idx_ss_subject ON student_subjects(subject_id);

-- ── 3. student_remarks ────────────────────────────────────────────────────────
-- Class-teacher-owned record per student per term.
-- Subject teachers have NO write access here.
CREATE TABLE student_remarks (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id         UUID         NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  entered_by       UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  term             TEXT         NOT NULL DEFAULT 'First Term',
  academic_year    TEXT         NOT NULL DEFAULT '2025/2026',
  -- Attendance
  times_present    INTEGER      NOT NULL DEFAULT 0 CHECK (times_present >= 0),
  times_absent     INTEGER      NOT NULL DEFAULT 0 CHECK (times_absent  >= 0),
  times_late       INTEGER      NOT NULL DEFAULT 0 CHECK (times_late    >= 0),
  -- Behaviour (WAEC 5-band scale)
  behaviour_rating TEXT         CHECK (behaviour_rating IN ('Excellent','Very Good','Good','Fair','Poor')),
  -- Remarks (free text, max 500 chars)
  teacher_remark   TEXT         CHECK (char_length(teacher_remark)   <= 500),
  principal_remark TEXT         CHECK (char_length(principal_remark) <= 500),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, term, academic_year)
);

CREATE INDEX idx_remarks_student ON student_remarks(student_id);
CREATE INDEX idx_remarks_class   ON student_remarks(class_id);

-- Auto-update updated_at
CREATE TRIGGER remarks_updated_at
  BEFORE UPDATE ON student_remarks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE class_teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_subjects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_remarks            ENABLE ROW LEVEL SECURITY;

-- class_teacher_assignments
CREATE POLICY "cta:admin"   ON class_teacher_assignments FOR ALL
  USING (get_my_role() = 'ADMIN') WITH CHECK (get_my_role() = 'ADMIN');

CREATE POLICY "cta:teacher_read" ON class_teacher_assignments FOR SELECT
  USING (teacher_id = auth.uid() OR get_my_role() = 'ADMIN');

-- student_subjects
CREATE POLICY "ss:admin"   ON student_subjects FOR ALL
  USING (get_my_role() = 'ADMIN') WITH CHECK (get_my_role() = 'ADMIN');

CREATE POLICY "ss:teacher_read" ON student_subjects FOR SELECT
  USING (
    get_my_role() IN ('ADMIN', 'TEACHER')
  );

-- student_remarks: class teacher write, admin full access
CREATE POLICY "remarks:admin" ON student_remarks FOR ALL
  USING (get_my_role() = 'ADMIN') WITH CHECK (get_my_role() = 'ADMIN');

-- Class teacher can write remarks for their assigned class
CREATE POLICY "remarks:class_teacher_insert" ON student_remarks FOR INSERT
  WITH CHECK (
    get_my_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM public.class_teacher_assignments cta
      WHERE cta.teacher_id = auth.uid()
        AND cta.class_id = student_remarks.class_id
    )
  );

CREATE POLICY "remarks:class_teacher_update" ON student_remarks FOR UPDATE
  USING (
    entered_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_teacher_assignments cta
      WHERE cta.teacher_id = auth.uid()
        AND cta.class_id = student_remarks.class_id
    )
  );

CREATE POLICY "remarks:teacher_read" ON student_remarks FOR SELECT
  USING (
    get_my_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM public.class_teacher_assignments cta
      WHERE cta.teacher_id = auth.uid()
        AND cta.class_id = student_remarks.class_id
    )
  );
