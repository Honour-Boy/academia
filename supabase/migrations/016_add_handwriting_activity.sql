-- ─────────────────────────────────────────────────────────────────────────────
-- 016_add_handwriting_activity.sql
--
-- Correction to migration 015: the Second-Term report sheet's Part B has 16
-- printed rows, not 15 — the last is "Handwriting", missed on the first pass.
-- Add it as the 16th activity. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.behaviour_activities (name, sort_order)
select 'Handwriting', 16
where not exists (
  select 1 from public.behaviour_activities where lower(name) = 'handwriting'
);

update public.behaviour_activities
set is_active = true, sort_order = 16
where lower(name) = 'handwriting';
