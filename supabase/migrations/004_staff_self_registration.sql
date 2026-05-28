-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Staff self-registration + admin approval queue
--
-- Adds an external onboarding path. New staff create their own account (email or
-- Google), fill out a profile, and pick their role + homeroom + subjects. Their
-- account lands in status = 'pending' with is_active = FALSE — meaning ZERO data
-- access (get_my_role() already requires is_active = TRUE, so pending users
-- resolve to no role and see no rows on any grade table). An admin then reviews
-- the queue and Approves (→ active) or Denies.
--
-- Security note: a self-registrant may *request* the ADMIN role, but it is inert
-- until a human admin approves. Approval is the only gate that grants access.
-- The strict invariant holds: no role claim / inactive → no rows, everywhere.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Profile columns for onboarding ─────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status              TEXT    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied')),
  ADD COLUMN IF NOT EXISTS phone               TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url          TEXT,
  ADD COLUMN IF NOT EXISTS wants_class_teacher BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requested_class_id  UUID    REFERENCES classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);

-- Existing accounts (the seeded admin + any pre-OAuth teachers) are already
-- trusted staff — mark them approved + onboarded so they keep full access.
UPDATE profiles
   SET status = 'approved',
       onboarding_complete = TRUE
 WHERE is_active = TRUE;

-- ── 2. staff_subject_requests ─────────────────────────────────────────────────
-- The subjects a registrant says they mark scripts for. This is review material
-- for the admin (the precise class×subject assignment is still made in
-- /admin/assignments). FK-linked to the auth-backed profile.
CREATE TABLE IF NOT EXISTS staff_subject_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id  UUID        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_ssr_profile ON staff_subject_requests(profile_id);

ALTER TABLE staff_subject_requests ENABLE ROW LEVEL SECURITY;

-- Admin: full access (review the queue). User: read own requests only.
CREATE POLICY "ssr:admin" ON staff_subject_requests FOR ALL
  USING (get_my_role() = 'ADMIN')
  WITH CHECK (get_my_role() = 'ADMIN');

CREATE POLICY "ssr:own_read" ON staff_subject_requests FOR SELECT
  USING (profile_id = auth.uid());

-- ── 3. Allow a pending user to read their OWN profile ─────────────────────────
-- profiles:select from migration 001 already permits `id = auth.uid()`, so a
-- pending user can read their own row (needed to render the holding screen).
-- get_my_role() still returns NULL for them (is_active = FALSE) → no other data.

-- ── 4. Rewrite handle_new_user — every new auth user gets a PENDING profile ────
-- Fires AFTER INSERT on auth.users for both password sign-ups (Admin API) and
-- OAuth. The profile starts inactive/pending; the role here is only a default
-- (the registration form and, ultimately, the admin set the real role).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, is_active, onboarding_complete)
  VALUES (
    NEW.id,
    lower(NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'TEACHER',     -- default; never trusted for access — approval is the gate
    'pending',
    FALSE,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
