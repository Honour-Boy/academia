-- ═══════════════════════════════════════════════════════════════════════════════
-- Academia Grading Platform — Initial Schema
-- Security model: ADMIN and TEACHER roles only.
-- Students have NO role, NO auth user, and see ZERO rows via RLS.
-- ═══════════════════════════════════════════════════════════════════════════════

-- gen_random_uuid() is built-in from Postgres 13+ (no extension needed)
-- uuid-ossp kept only for compatibility; gen_random_uuid() not used

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- 1. Profiles (extends auth.users, holds role)
CREATE TABLE profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- no default; comes from auth.users
  full_name   TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  role        TEXT        NOT NULL DEFAULT 'TEACHER' CHECK (role IN ('ADMIN','TEACHER')),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Classes  e.g. "JSS 2A", "SS 3B"
CREATE TABLE classes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,     -- display name e.g. "JSS 2A"
  level       TEXT        NOT NULL,     -- "JSS" | "SS"
  arm         TEXT        NOT NULL DEFAULT 'A',
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Subjects
CREATE TABLE subjects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Teacher ↔ Class + Subject assignments (admin-managed)
CREATE TABLE teacher_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id       UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id     UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  term           TEXT NOT NULL DEFAULT 'First Term',
  academic_year  TEXT NOT NULL DEFAULT '2025/2026',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, class_id, subject_id, term, academic_year)
);

-- 5. Students (metadata only — never granted auth access)
CREATE TABLE students (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT    NOT NULL,
  student_number  TEXT    UNIQUE,
  class_id        UUID    NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Score components  CA1=20pts, CA2=20pts, Exam=60pts
CREATE TABLE score_components (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT    NOT NULL,
  max_score         INTEGER NOT NULL CHECK (max_score > 0),
  weight_percentage INTEGER NOT NULL CHECK (weight_percentage > 0 AND weight_percentage <= 100),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO score_components (name, max_score, weight_percentage, sort_order) VALUES
  ('CA 1',  20, 20, 1),
  ('CA 2',  20, 20, 2),
  ('Exam',  60, 60, 3);

-- 7. Grades — maximum RLS protection
CREATE TABLE grades (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id    UUID         NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id      UUID         NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  component_id  UUID         NOT NULL REFERENCES score_components(id) ON DELETE CASCADE,
  score         NUMERIC(5,2) CHECK (score >= 0),
  term          TEXT         NOT NULL DEFAULT 'First Term',
  academic_year TEXT         NOT NULL DEFAULT '2025/2026',
  entered_by    UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, subject_id, component_id, term, academic_year)
);

-- 8. Audit log — immutable from client; only triggers write here
CREATE TABLE grade_audit_log (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id         UUID         NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  changed_by       UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  changed_by_name  TEXT,        -- denormalized — preserved if profile later deleted
  old_score        NUMERIC(5,2),
  new_score        NUMERIC(5,2),
  action           TEXT         NOT NULL DEFAULT 'UPDATE' CHECK (action IN ('INSERT','UPDATE')),
  changed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_grades_student        ON grades(student_id);
CREATE INDEX idx_grades_class_subject  ON grades(class_id, subject_id);
CREATE INDEX idx_grades_term_year      ON grades(term, academic_year);
CREATE INDEX idx_ta_teacher            ON teacher_assignments(teacher_id);
CREATE INDEX idx_ta_class_subject      ON teacher_assignments(class_id, subject_id);
CREATE INDEX idx_students_class        ON students(class_id);
CREATE INDEX idx_audit_grade           ON grade_audit_log(grade_id);

-- ─── Helper Functions (used in RLS) ───────────────────────────────────────────

-- Returns current user's role — SECURITY DEFINER so it can bypass RLS on profiles
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = TRUE LIMIT 1;
$$;

-- Returns TRUE if current teacher is assigned to class+subject
CREATE OR REPLACE FUNCTION is_my_assignment(p_class_id UUID, p_subject_id UUID)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM teacher_assignments
    WHERE teacher_id  = auth.uid()
      AND class_id    = p_class_id
      AND subject_id  = p_subject_id
  );
$$;

-- ─── Trigger: auto-update updated_at ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER grades_updated_at   BEFORE UPDATE ON grades   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Trigger: auto-create profile on signup ───────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'TEACHER')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Trigger: grade audit log ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_grade_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_name TEXT;
BEGIN
  SELECT full_name INTO v_name FROM profiles WHERE id = NEW.entered_by;

  IF TG_OP = 'INSERT' AND NEW.score IS NOT NULL THEN
    INSERT INTO grade_audit_log
      (grade_id, changed_by, changed_by_name, old_score, new_score, action)
    VALUES (NEW.id, NEW.entered_by, v_name, NULL, NEW.score, 'INSERT');

  ELSIF TG_OP = 'UPDATE' AND OLD.score IS DISTINCT FROM NEW.score THEN
    INSERT INTO grade_audit_log
      (grade_id, changed_by, changed_by_name, old_score, new_score, action)
    VALUES (NEW.id, NEW.entered_by, v_name, OLD.score, NEW.score, 'UPDATE');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER grades_audit_insert AFTER INSERT ON grades FOR EACH ROW EXECUTE FUNCTION log_grade_change();
CREATE TRIGGER grades_audit_update AFTER UPDATE ON grades FOR EACH ROW EXECUTE FUNCTION log_grade_change();

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Rule: no role claim → zero rows. Period.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE students           ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_components   ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_audit_log    ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles:select" ON profiles FOR SELECT
  USING (id = auth.uid() OR get_my_role() = 'ADMIN');
CREATE POLICY "profiles:insert" ON profiles FOR INSERT
  WITH CHECK (get_my_role() = 'ADMIN');
CREATE POLICY "profiles:update" ON profiles FOR UPDATE
  USING (id = auth.uid() OR get_my_role() = 'ADMIN');
CREATE POLICY "profiles:delete" ON profiles FOR DELETE
  USING (get_my_role() = 'ADMIN');

-- classes
CREATE POLICY "classes:select" ON classes FOR SELECT USING (get_my_role() IN ('ADMIN','TEACHER'));
CREATE POLICY "classes:insert" ON classes FOR INSERT WITH CHECK (get_my_role() = 'ADMIN');
CREATE POLICY "classes:update" ON classes FOR UPDATE USING (get_my_role() = 'ADMIN');
CREATE POLICY "classes:delete" ON classes FOR DELETE USING (get_my_role() = 'ADMIN');

-- subjects
CREATE POLICY "subjects:select" ON subjects FOR SELECT USING (get_my_role() IN ('ADMIN','TEACHER'));
CREATE POLICY "subjects:insert" ON subjects FOR INSERT WITH CHECK (get_my_role() = 'ADMIN');
CREATE POLICY "subjects:update" ON subjects FOR UPDATE USING (get_my_role() = 'ADMIN');
CREATE POLICY "subjects:delete" ON subjects FOR DELETE USING (get_my_role() = 'ADMIN');

-- teacher_assignments
CREATE POLICY "ta:select" ON teacher_assignments FOR SELECT
  USING (teacher_id = auth.uid() OR get_my_role() = 'ADMIN');
CREATE POLICY "ta:insert" ON teacher_assignments FOR INSERT WITH CHECK (get_my_role() = 'ADMIN');
CREATE POLICY "ta:update" ON teacher_assignments FOR UPDATE USING (get_my_role() = 'ADMIN');
CREATE POLICY "ta:delete" ON teacher_assignments FOR DELETE USING (get_my_role() = 'ADMIN');

-- students — teacher sees only students in assigned classes
CREATE POLICY "students:select" ON students FOR SELECT
  USING (
    get_my_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid() AND ta.class_id = students.class_id
    )
  );
CREATE POLICY "students:insert" ON students FOR INSERT WITH CHECK (get_my_role() = 'ADMIN');
CREATE POLICY "students:update" ON students FOR UPDATE USING (get_my_role() = 'ADMIN');
CREATE POLICY "students:delete" ON students FOR DELETE USING (get_my_role() = 'ADMIN');

-- score_components
CREATE POLICY "sc:select" ON score_components FOR SELECT USING (get_my_role() IN ('ADMIN','TEACHER'));
CREATE POLICY "sc:insert" ON score_components FOR INSERT WITH CHECK (get_my_role() = 'ADMIN');
CREATE POLICY "sc:update" ON score_components FOR UPDATE USING (get_my_role() = 'ADMIN');

-- grades — THE CRITICAL POLICIES
CREATE POLICY "grades:select" ON grades FOR SELECT
  USING (get_my_role() = 'ADMIN' OR is_my_assignment(class_id, subject_id));
CREATE POLICY "grades:insert" ON grades FOR INSERT
  WITH CHECK (get_my_role() = 'ADMIN' OR is_my_assignment(class_id, subject_id));
CREATE POLICY "grades:update" ON grades FOR UPDATE
  USING (get_my_role() = 'ADMIN' OR is_my_assignment(class_id, subject_id));
CREATE POLICY "grades:delete" ON grades FOR DELETE
  USING (get_my_role() = 'ADMIN');

-- grade_audit_log — READ ONLY from client; triggers write via SECURITY DEFINER
CREATE POLICY "audit:admin"   ON grade_audit_log FOR SELECT USING (get_my_role() = 'ADMIN');
CREATE POLICY "audit:teacher" ON grade_audit_log FOR SELECT
  USING (changed_by = auth.uid() AND get_my_role() = 'TEACHER');

-- ─── Seed: Subjects ───────────────────────────────────────────────────────────

INSERT INTO subjects (name) VALUES
  ('English Language'), ('Mathematics'), ('Basic Science'),
  ('Social Studies'), ('Civic Education'), ('Agricultural Science'),
  ('Computer Studies'), ('Business Studies'), ('French'),
  ('Fine Art'), ('Physical & Health Education'),
  ('Christian Religious Studies'), ('Islamic Religious Studies')
ON CONFLICT (name) DO NOTHING;
