-- ─────────────────────────────────────────────────────────────────────────────
-- 010_profile_soft_delete.sql
--
-- Adds a soft-delete column to `profiles` so admins can permanently remove a
-- teacher/admin from the active staff list without breaking historical
-- references in `grades.entered_by`, audit logs, etc.
--
-- A row with deleted_at IS NOT NULL is treated as if it doesn't exist by the
-- application layer (filtered out of every staff query). The auth.users row
-- is left intact — the soft-delete flow handles auth via Supabase admin API
-- inside the same server action so a deleted profile can never sign in again.
--
-- Idempotent: column add uses IF NOT EXISTS, index uses IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index so "active staff" lookups stay fast even as the deleted
-- pile grows. Most queries filter `deleted_at IS NULL`, so the index covers
-- just the live rows.
CREATE INDEX IF NOT EXISTS profiles_deleted_at_null_idx
  ON public.profiles (id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Set when an admin soft-deletes the account via /admin/teachers. Row is hidden from every staff query but kept for audit-log referential integrity. Reversible by an admin restoring via Supabase dashboard.';
