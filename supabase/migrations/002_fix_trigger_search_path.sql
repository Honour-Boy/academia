-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: add SET search_path = public to all SECURITY DEFINER functions.
-- Supabase runs SECURITY DEFINER functions in an empty search_path by default,
-- which causes "relation does not exist" errors at runtime.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. handle_new_user — fires when a new auth.users row is inserted
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'TEACHER')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. log_grade_change — fires on grade INSERT / UPDATE
CREATE OR REPLACE FUNCTION public.log_grade_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_name TEXT;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.entered_by;

  IF TG_OP = 'INSERT' AND NEW.score IS NOT NULL THEN
    INSERT INTO public.grade_audit_log
      (grade_id, changed_by, changed_by_name, old_score, new_score, action)
    VALUES (NEW.id, NEW.entered_by, v_name, NULL, NEW.score, 'INSERT');

  ELSIF TG_OP = 'UPDATE' AND OLD.score IS DISTINCT FROM NEW.score THEN
    INSERT INTO public.grade_audit_log
      (grade_id, changed_by, changed_by_name, old_score, new_score, action)
    VALUES (NEW.id, NEW.entered_by, v_name, OLD.score, NEW.score, 'UPDATE');
  END IF;

  RETURN NEW;
END;
$$;

-- 3. RLS helper functions
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_my_assignment(p_class_id UUID, p_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teacher_assignments
    WHERE teacher_id  = auth.uid()
      AND class_id    = p_class_id
      AND subject_id  = p_subject_id
  );
$$;

-- 4. set_updated_at (not SECURITY DEFINER but good to be explicit)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
