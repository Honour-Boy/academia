-- ─────────────────────────────────────────────────────────────────────────────
-- 015_second_term_catalogue.sql
--
-- Re-models the subject + behaviour-activity catalogues to match the supplied
-- "MY DREAM COLLEGE" Second-Term report sheet
-- (backend/src/templates/report_sheet_template.pdf).
--
-- ⚠️ DESTRUCTIVE. subjects + behaviour_activities are referenced ON DELETE CASCADE
-- by student_subjects, teacher_assignments, grades (→ grade_audit_log), and
-- student_behaviour_scores. Deleting a catalogue row deletes its dependent data.
-- This is intended ("entire flush and remodelling") but irreversible — run on
-- STAGING first and back up grades / student_subjects / teacher_assignments /
-- student_behaviour_scores before applying to a database with real data.
--
-- Strategy: keep rows whose names already match (sparing their data), delete the
-- rest, insert the missing ones. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Subjects → the template's 16 ────────────────────────────────────────────
-- Kept in place (already present, data preserved): Mathematics, English Language,
-- Civic Education, Christian Religious Studies, Agricultural Science.
-- Removed (cascade): Basic Science, Social Studies, Computer Studies, Business
-- Studies, French, Fine Art, Physical & Health Education, Islamic Religious Studies.
delete from public.subjects
where name not in (
  'Mathematics', 'English Language', 'Physics', 'Chemistry', 'Biology',
  'Economics', 'Financial Accounting', 'Yoruba', 'Commerce',
  'Further Mathematics', 'Marketing', 'Literature in English', 'Government',
  'Civic Education', 'Christian Religious Studies', 'Agricultural Science'
);

insert into public.subjects (name) values
  ('Physics'), ('Chemistry'), ('Biology'), ('Economics'),
  ('Financial Accounting'), ('Yoruba'), ('Commerce'), ('Further Mathematics'),
  ('Marketing'), ('Literature in English'), ('Government')
on conflict (name) do nothing;

-- Note for the Phase 3 renderer: printed row labels abbreviate two of these —
-- "FINANCIAL ACCOUNT" → 'Financial Accounting', "LITERATURE IN ENGLISH" →
-- 'Literature in English'. The overlay maps printed rows → catalogue names
-- explicitly, so exact label equality is not required (matching is by intent).

-- ── Behaviour activities → the template's 15 (Part B) ───────────────────────
-- Renames preserve any existing student_behaviour_scores. Two extras dropped
-- (Attractiveness, Manufacturing); two mis-spellings fixed; order re-sequenced
-- to match the sheet.
delete from public.behaviour_activities
where name in ('Attractiveness', 'Manufacturing');

update public.behaviour_activities set name = 'Carrying of Assignment'
  where name = 'Carrying of Assignments';
update public.behaviour_activities set name = 'Games & Sports'
  where name = 'Careers & Sports';

-- Re-sequence sort_order. Offset first to dodge the UNIQUE(sort_order) constraint
-- mid-shuffle (constraint is checked per-row, not deferred).
update public.behaviour_activities set sort_order = sort_order + 100;

update public.behaviour_activities set sort_order = 1  where name = 'Punctuality';
update public.behaviour_activities set sort_order = 2  where name = 'Class Attendance';
update public.behaviour_activities set sort_order = 3  where name = 'Carrying of Assignment';
update public.behaviour_activities set sort_order = 4  where name = 'Neatness';
update public.behaviour_activities set sort_order = 5  where name = 'Politeness';
update public.behaviour_activities set sort_order = 6  where name = 'Relationship with Staff';
update public.behaviour_activities set sort_order = 7  where name = 'Relationship with Students';
update public.behaviour_activities set sort_order = 8  where name = 'Attentiveness';
update public.behaviour_activities set sort_order = 9  where name = 'Initiative';
update public.behaviour_activities set sort_order = 10 where name = 'Emotional Stability';
update public.behaviour_activities set sort_order = 11 where name = 'Attitude to Study';
update public.behaviour_activities set sort_order = 12 where name = 'Attitude to Property';
update public.behaviour_activities set sort_order = 13 where name = 'Clubs & Societies';
update public.behaviour_activities set sort_order = 14 where name = 'Games & Sports';
update public.behaviour_activities set sort_order = 15 where name = 'Manual Skill';

-- Safety net for a partially-seeded DB: ensure all 15 exist + are active.
insert into public.behaviour_activities (name, sort_order) values
  ('Punctuality', 1), ('Class Attendance', 2), ('Carrying of Assignment', 3),
  ('Neatness', 4), ('Politeness', 5), ('Relationship with Staff', 6),
  ('Relationship with Students', 7), ('Attentiveness', 8), ('Initiative', 9),
  ('Emotional Stability', 10), ('Attitude to Study', 11), ('Attitude to Property', 12),
  ('Clubs & Societies', 13), ('Games & Sports', 14), ('Manual Skill', 15)
on conflict (sort_order) do nothing;

update public.behaviour_activities set is_active = true
where name in (
  'Punctuality', 'Class Attendance', 'Carrying of Assignment', 'Neatness',
  'Politeness', 'Relationship with Staff', 'Relationship with Students',
  'Attentiveness', 'Initiative', 'Emotional Stability', 'Attitude to Study',
  'Attitude to Property', 'Clubs & Societies', 'Games & Sports', 'Manual Skill'
);
