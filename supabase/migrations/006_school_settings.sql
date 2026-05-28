-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: school_settings (current term + academic year, admin-editable)
--
-- Before this, currentTerm() / currentAcademicYear() in the frontend were
-- computed from the wall-clock date. That guesses wrong any time the real
-- school calendar drifts from the heuristic (resumption delays, term
-- extensions, mid-term rollovers, etc). The admin now controls these
-- explicitly.
--
-- Design: single-row table anchored with CHECK (id = 1) so SELECT/UPSERT can
-- target id=1 without worrying about which row "wins". Cheaper than a
-- key/value store for two fixed knobs.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_settings (
  id                    INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_term          TEXT        NOT NULL DEFAULT 'First Term'
                          CHECK (current_term IN ('First Term', 'Second Term', 'Third Term')),
  current_academic_year TEXT        NOT NULL DEFAULT '2025/2026',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID        REFERENCES profiles(id) ON DELETE SET NULL
);

-- Seed the single row. ON CONFLICT keeps re-runs idempotent so this migration
-- is safe to re-apply against a project that already has the row.
INSERT INTO school_settings (id, current_term, current_academic_year)
VALUES (
  1,
  -- Nigerian academic year starts September. Pick the term that matches the
  -- migration's apply time so the system starts in a sensible state.
  CASE
    WHEN EXTRACT(MONTH FROM NOW()) >= 9 OR EXTRACT(MONTH FROM NOW()) <= 12 THEN 'First Term'
    WHEN EXTRACT(MONTH FROM NOW()) BETWEEN 1 AND 4 THEN 'Second Term'
    ELSE 'Third Term'
  END,
  CASE
    WHEN EXTRACT(MONTH FROM NOW()) >= 9
      THEN EXTRACT(YEAR FROM NOW())::TEXT || '/' || (EXTRACT(YEAR FROM NOW()) + 1)::TEXT
    ELSE (EXTRACT(YEAR FROM NOW()) - 1)::TEXT || '/' || EXTRACT(YEAR FROM NOW())::TEXT
  END
)
ON CONFLICT (id) DO NOTHING;

-- Bump updated_at automatically.
CREATE TRIGGER school_settings_updated_at
  BEFORE UPDATE ON school_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Every authenticated user reads (layouts + grade pages need the current term
-- on every render). Only ADMIN writes.
ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_settings:read_authed" ON school_settings
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "school_settings:admin_update" ON school_settings
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'ADMIN')
  WITH CHECK (get_my_role() = 'ADMIN');

-- No INSERT / DELETE policies — the seed inserts the only row and the CHECK
-- (id = 1) prevents a second one. Deletion is intentionally impossible.
