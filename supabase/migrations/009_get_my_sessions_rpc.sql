-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009: SECURITY DEFINER RPC to expose the caller's auth.sessions
--
-- PostgREST doesn't expose the auth schema, so a direct .schema('auth')
-- .from('sessions') call from the JS client silently returns []. The
-- /profile "Active sessions" card relied on that and showed empty for every
-- user. Solution: a SECURITY DEFINER function in the public schema that
-- returns the CALLER'S OWN sessions only (scoped by auth.uid()).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_sessions()
RETURNS TABLE (
  id            UUID,
  created_at    TIMESTAMPTZ,
  refreshed_at  TIMESTAMP,
  user_agent    TEXT,
  ip            INET
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.created_at, s.refreshed_at, s.user_agent, s.ip
  FROM auth.sessions s
  WHERE s.user_id = auth.uid()
  ORDER BY s.refreshed_at DESC NULLS LAST;
$$;

-- Lock down: only signed-in users (any role) can call it. The function
-- itself is scoped to auth.uid(), so it can only ever return the caller's
-- own rows. No way to leak other users' sessions.
REVOKE ALL ON FUNCTION public.get_my_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_sessions() TO authenticated;
