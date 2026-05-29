/**
 * Pure, client-safe types and helpers for the behaviour matrix.
 *
 * The server-only fetch helpers live in `lib/behaviour-server.ts`. This file
 * is importable from both server and client components.
 */

export interface BehaviourActivityRow {
  id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
}

/** Score → human label. Reused on the report PDF + class teacher matrix. */
export const SCORE_KEYS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: 'Very Good',
  4: 'Good',
  3: 'Fair',
  2: 'Weak',
  1: 'Poor',
}

export function isValidScore(n: number): n is 1 | 2 | 3 | 4 | 5 {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5
}

/**
 * Average a list of scores. Returns null when no scores are present so the
 * "average across terms" column hides itself instead of printing NaN.
 */
export function averageScores(scores: (number | null | undefined)[]): number | null {
  const filtered = scores.filter((s): s is number => typeof s === 'number')
  if (filtered.length === 0) return null
  const sum = filtered.reduce((a, b) => a + b, 0)
  return sum / filtered.length
}

/** Validate a candidate ordered list of activities for the admin editor. */
export function validateActivities(
  rows: { name: string; sort_order: number }[],
): { valid: true } | { valid: false; error: string } {
  if (rows.length === 0) return { valid: false, error: 'Keep at least one activity.' }
  const names = new Set<string>()
  for (const r of rows) {
    const trimmed = r.name.trim()
    if (!trimmed) return { valid: false, error: 'Every activity needs a name.' }
    const key = trimmed.toLowerCase()
    if (names.has(key)) return { valid: false, error: `Duplicate activity: ${trimmed}` }
    names.add(key)
  }
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].sort_order !== i + 1) {
      return { valid: false, error: 'sort_order must be 1, 2, 3, … with no gaps.' }
    }
  }
  return { valid: true }
}
