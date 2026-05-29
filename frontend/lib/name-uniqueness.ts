// Shared helpers for enforcing case-insensitive uniqueness of full names across
// profiles (admins + teachers) and students. The rule: if you collide with an
// existing person, add a middle name to disambiguate.

import type { SupabaseClient } from '@supabase/supabase-js'

export const DUPLICATE_NAME_HINT =
  'Add a middle name (or initial) to differentiate.'

/** Collapse a name to a comparable canonical form. */
export function canonicalName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9 ]/g, ' ')        // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
}

export interface NameConflict {
  kind: 'profile' | 'student'
  existingName: string
}

interface CheckResult {
  conflict: false | NameConflict
}

/**
 * Returns { conflict: { kind, existingName } } if `name` matches an existing
 * teacher/admin (`profiles.full_name`) or student (`students.full_name`) by
 * canonical form. Pass `ignoreProfileId` / `ignoreStudentId` to skip the row
 * being edited.
 *
 * Must be called with an admin (service-role) client because RLS hides other
 * profiles from a regular signed-in user.
 */
export async function findNameConflict(
  admin: SupabaseClient,
  rawName: string,
  opts: { ignoreProfileId?: string; ignoreStudentId?: string } = {},
): Promise<CheckResult> {
  const canon = canonicalName(rawName)
  if (!canon) return { conflict: false }

  // Don't trip on soft-deleted profiles — the row is preserved for audit-log
  // referential integrity but the name should free up for reuse.
  const [{ data: profiles }, { data: students }] = await Promise.all([
    admin.from('profiles').select('id, full_name').is('deleted_at', null),
    admin.from('students').select('id, full_name'),
  ])

  for (const p of profiles ?? []) {
    if (opts.ignoreProfileId && p.id === opts.ignoreProfileId) continue
    if (canonicalName(p.full_name ?? '') === canon) {
      return { conflict: { kind: 'profile', existingName: p.full_name } }
    }
  }
  for (const s of students ?? []) {
    if (opts.ignoreStudentId && s.id === opts.ignoreStudentId) continue
    if (canonicalName(s.full_name ?? '') === canon) {
      return { conflict: { kind: 'student', existingName: s.full_name } }
    }
  }
  return { conflict: false }
}

/** Stable error message used by the create/update actions. */
export function duplicateNameError(conflict: NameConflict): string {
  const who = conflict.kind === 'profile' ? 'staff member' : 'student'
  return `"${conflict.existingName}" already exists as a ${who}. ${DUPLICATE_NAME_HINT}`
}
