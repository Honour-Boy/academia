-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007:
--   (a) Fix RLS so class teachers can see students in their class.
--       Before: students:select only allowed teachers via teacher_assignments
--       (subject assignments). A class teacher with no subject assignment for
--       a class couldn't see any of their own students — broke the entire
--       class-teacher attendance/behaviour flow.
--   (b) New staff_subject_change_requests table — teachers propose changes to
--       the subjects they teach (add/remove), admins approve from
--       /admin/approvals.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (a) students:select — include class teachers ─────────────────────────────

DROP POLICY IF EXISTS "students:select" ON students;
CREATE POLICY "students:select" ON students FOR SELECT
  USING (
    get_my_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid() AND ta.class_id = students.class_id
    )
    OR EXISTS (
      SELECT 1 FROM class_teacher_assignments cta
      WHERE cta.teacher_id = auth.uid() AND cta.class_id = students.class_id
    )
  );

-- ── (b) staff_subject_change_requests ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_subject_change_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'denied')),
  reviewer_note TEXT        CHECK (char_length(reviewer_note) <= 500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sscr_profile  ON staff_subject_change_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_sscr_status   ON staff_subject_change_requests(status);

-- One pending request per teacher at a time — partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_change_per_user
  ON staff_subject_change_requests(profile_id)
  WHERE status = 'pending';

-- Per-request proposed subject list. Stored as a join table so we can FK and
-- reuse standard subject rows rather than serialising IDs as JSON / arrays.
CREATE TABLE IF NOT EXISTS staff_subject_change_request_subjects (
  request_id  UUID NOT NULL REFERENCES staff_subject_change_requests(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, subject_id)
);

ALTER TABLE staff_subject_change_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_subject_change_request_subjects  ENABLE ROW LEVEL SECURITY;

-- Admin: full access on both. Teacher: read + insert/update OWN pending row,
-- read OWN subject lines.
DROP POLICY IF EXISTS "sscr:admin" ON staff_subject_change_requests;
CREATE POLICY "sscr:admin" ON staff_subject_change_requests FOR ALL
  USING (get_my_role() = 'ADMIN')
  WITH CHECK (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS "sscr:own_read" ON staff_subject_change_requests;
CREATE POLICY "sscr:own_read" ON staff_subject_change_requests FOR SELECT
  USING (profile_id = auth.uid());

-- Teachers create only their own row, only in 'pending' state, and can only
-- update / cancel their own pending row (status flip to denied / approved is
-- admin-only via the admin policy above).
DROP POLICY IF EXISTS "sscr:own_insert" ON staff_subject_change_requests;
CREATE POLICY "sscr:own_insert" ON staff_subject_change_requests FOR INSERT
  WITH CHECK (profile_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "sscr:own_delete" ON staff_subject_change_requests;
CREATE POLICY "sscr:own_delete" ON staff_subject_change_requests FOR DELETE
  USING (profile_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "sscr_subjects:admin" ON staff_subject_change_request_subjects;
CREATE POLICY "sscr_subjects:admin" ON staff_subject_change_request_subjects FOR ALL
  USING (get_my_role() = 'ADMIN')
  WITH CHECK (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS "sscr_subjects:own_read" ON staff_subject_change_request_subjects;
CREATE POLICY "sscr_subjects:own_read" ON staff_subject_change_request_subjects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff_subject_change_requests r
      WHERE r.id = request_id AND r.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sscr_subjects:own_insert" ON staff_subject_change_request_subjects;
CREATE POLICY "sscr_subjects:own_insert" ON staff_subject_change_request_subjects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff_subject_change_requests r
      WHERE r.id = request_id
        AND r.profile_id = auth.uid()
        AND r.status = 'pending'
    )
  );

DROP POLICY IF EXISTS "sscr_subjects:own_delete" ON staff_subject_change_request_subjects;
CREATE POLICY "sscr_subjects:own_delete" ON staff_subject_change_request_subjects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM staff_subject_change_requests r
      WHERE r.id = request_id
        AND r.profile_id = auth.uid()
        AND r.status = 'pending'
    )
  );
