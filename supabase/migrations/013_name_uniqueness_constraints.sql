-- 013_name_uniqueness_constraints.sql
--
-- Hardens the app-level name uniqueness rule at the database layer. Prior to
-- this migration the only thing stopping two people with the same name from
-- being created was `findNameConflict()` in the Next.js app — a direct write
-- via the Supabase dashboard (or any future service that bypasses the API)
-- would not be caught. This migration makes the rule enforceable in Postgres.
--
-- Cross-table check (profiles ↔ students) is done with BEFORE triggers, since
-- UNIQUE indexes can't span tables. Per-table dupes are caught by partial
-- UNIQUE indexes on `canonical_name(full_name)`.

-- ─── canonical_name() ────────────────────────────────────────────────────────
-- Mirrors the JS `canonicalName()` helper:
--   lowercase + strip diacritics + collapse non-alphanumerics to single spaces.
-- Marked IMMUTABLE so we can reference it from indexes. unaccent() itself is
-- STABLE because its dictionary can be rebuilt; we accept that risk in
-- exchange for the indexing benefit — the unaccent dictionary doesn't change
-- in practice on a managed Supabase project.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.canonical_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT trim(both ' ' FROM
    regexp_replace(
      lower(public.unaccent('public.unaccent', input)),
      '[^a-z0-9]+', ' ', 'g'
    )
  );
$$;

-- ─── Per-table UNIQUE indexes (partial, on the live rows only) ──────────────
-- Soft-deleted profiles (deleted_at IS NOT NULL) and graduated/withdrawn
-- students (is_active = false) are excluded so an admin can re-use a name
-- after the original holder is gone.

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_canonical_name_live
  ON public.profiles (canonical_name(full_name))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_students_canonical_name_live
  ON public.students (canonical_name(full_name))
  WHERE is_active = true;

-- ─── Cross-table BEFORE trigger ─────────────────────────────────────────────
-- profiles and students share a single namespace from the user's POV — a
-- staff member named "Ade Bello" and a student named "Ade Bello" are
-- ambiguous in any UI that names humans. The app already enforces this; the
-- trigger catches direct-DB writes that go around the app.
--
-- Caveats:
--   * Best-effort under concurrency — two interleaved INSERTs in the same
--     ms-window can both pass the EXISTS check and both commit. The per-table
--     UNIQUE index catches in-table races; cross-table races are rare enough
--     in this single-school deployment to accept.
--   * On UPDATE we only re-check if full_name actually changed (the WHEN
--     clause on the trigger keeps idle UPDATEs cheap).

CREATE OR REPLACE FUNCTION public.enforce_cross_table_name_unique()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  canon text;
BEGIN
  canon := canonical_name(NEW.full_name);

  IF TG_TABLE_NAME = 'profiles' THEN
    -- Block if any LIVE student already holds this canonical name.
    IF EXISTS (
      SELECT 1
        FROM public.students
       WHERE is_active = true
         AND canonical_name(full_name) = canon
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'unique_violation',
        MESSAGE = format('"%s" already exists as a student. Add a middle name (or initial) to differentiate.', NEW.full_name);
    END IF;

  ELSIF TG_TABLE_NAME = 'students' THEN
    -- Block if any LIVE profile already holds this canonical name.
    IF EXISTS (
      SELECT 1
        FROM public.profiles
       WHERE deleted_at IS NULL
         AND canonical_name(full_name) = canon
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'unique_violation',
        MESSAGE = format('"%s" already exists as a staff member. Add a middle name (or initial) to differentiate.', NEW.full_name);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_name_unique_check ON public.profiles;
CREATE TRIGGER profiles_name_unique_check
  BEFORE INSERT OR UPDATE OF full_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cross_table_name_unique();

DROP TRIGGER IF EXISTS students_name_unique_check ON public.students;
CREATE TRIGGER students_name_unique_check
  BEFORE INSERT OR UPDATE OF full_name ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cross_table_name_unique();
