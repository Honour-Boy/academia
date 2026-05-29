-- 014_name_uniqueness_advisory_lock.sql
--
-- Closes the cross-table race window left open by migration 013.
--
-- The original trigger ran an EXISTS check against the other table, which is
-- non-atomic: two concurrent INSERTs of the same canonical name (one into
-- `profiles`, one into `students`) could both pass the EXISTS check before
-- either committed, and both rows would land.
--
-- We fix this by taking a transaction-scoped advisory lock keyed on
-- `hashtext(canonical_name)` at the very top of the trigger. Postgres
-- serialises any concurrent transaction that tries to lock the same key,
-- so the second writer blocks until the first commits — at which point its
-- own EXISTS check sees the committed row and raises the unique violation.
--
-- Per-table UNIQUE indexes already close the in-table race; this migration
-- only addresses the cross-table case.

CREATE OR REPLACE FUNCTION public.enforce_cross_table_name_unique()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  canon text;
BEGIN
  canon := canonical_name(NEW.full_name);

  -- Transaction-scoped advisory lock. Released automatically at COMMIT or
  -- ROLLBACK. Two writers of the same canonical name into either table
  -- serialise through this lock.
  PERFORM pg_advisory_xact_lock(hashtext(canon));

  IF TG_TABLE_NAME = 'profiles' THEN
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
