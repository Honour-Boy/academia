import type { GradeLetter } from '@/types'

export interface GradingScaleRow {
  letter: string
  min_percentage: number
  description: string | null
  sort_order: number
}

/**
 * Default WAEC-style scale that mirrors what's seeded into `grading_scale` on
 * migration 011. Used as the fallback when the DB row hasn't been read yet
 * (transient bootstrap) so the UI never crashes on a fresh deployment.
 *
 * NOTE — this module is pure and importable from CLIENT components. The
 * server-only fetch helpers live in `lib/grading-scale-server.ts`.
 */
export const DEFAULT_GRADING_SCALE: GradingScaleRow[] = [
  { letter: 'A1', min_percentage: 75, description: 'Excellent',  sort_order: 1 },
  { letter: 'B2', min_percentage: 70, description: 'Very Good',  sort_order: 2 },
  { letter: 'B3', min_percentage: 65, description: 'Good',       sort_order: 3 },
  { letter: 'C4', min_percentage: 60, description: 'Credit',     sort_order: 4 },
  { letter: 'C5', min_percentage: 55, description: 'Credit',     sort_order: 5 },
  { letter: 'C6', min_percentage: 50, description: 'Pass',       sort_order: 6 },
  { letter: 'D7', min_percentage: 45, description: 'Pass',       sort_order: 7 },
  { letter: 'E8', min_percentage: 40, description: 'Pass',       sort_order: 8 },
  { letter: 'F9', min_percentage:  0, description: 'Fail',       sort_order: 9 },
]

/**
 * Map a percentage (0–100, can be fractional) to the configured letter.
 * Strategy: walk the scale top → bottom and pick the first row whose
 * min_percentage the score clears. Falls back to the LAST row's letter
 * (typically 'F9') when nothing matches.
 */
export function gradeLetterFromScale(
  percentage: number,
  scale: GradingScaleRow[],
): string {
  if (scale.length === 0) return 'F9'
  const sorted = [...scale].sort((a, b) => a.sort_order - b.sort_order)
  for (const row of sorted) {
    if (percentage >= row.min_percentage) return row.letter
  }
  return sorted[sorted.length - 1].letter
}

/**
 * Tailwind classes for any letter (configured or otherwise). Falls back to a
 * neutral pill so an admin-defined letter like "AA" still renders cleanly.
 */
const LETTER_PALETTE: Record<string, string> = {
  A1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  B2: 'bg-blue-50 text-blue-700 border-blue-200',
  B3: 'bg-blue-50 text-blue-600 border-blue-200',
  C4: 'bg-sky-50 text-sky-700 border-sky-200',
  C5: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  C6: 'bg-amber-50 text-amber-700 border-amber-200',
  D7: 'bg-orange-50 text-orange-700 border-orange-200',
  E8: 'bg-orange-50 text-orange-800 border-orange-300',
  F9: 'bg-red-50 text-red-700 border-red-200',
}

export function letterClasses(letter: string): string {
  return LETTER_PALETTE[letter]
    ?? 'bg-surface-muted text-ink border-surface-border'
}

/**
 * Validates a candidate scale before persistence. Rules:
 *   - At least 1 row
 *   - Unique letters
 *   - Unique sort_orders, 1-indexed contiguous
 *   - When sorted ascending by sort_order, min_percentage is strictly
 *     descending (A1 high → F9 low). Equal mins are rejected.
 *   - Min_percentage in [0, 100], lowest row's min must be 0.
 */
export function validateScale(rows: GradingScaleRow[]): { valid: true } | { valid: false; error: string } {
  if (rows.length === 0) return { valid: false, error: 'Add at least one letter.' }
  const letters = new Set<string>()
  for (const r of rows) {
    if (!r.letter.trim()) return { valid: false, error: 'Every letter needs a label.' }
    if (letters.has(r.letter.trim())) return { valid: false, error: `Duplicate letter: ${r.letter}` }
    letters.add(r.letter.trim())
    if (r.min_percentage < 0 || r.min_percentage > 100) {
      return { valid: false, error: `${r.letter}: min% must be between 0 and 100.` }
    }
  }
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].sort_order !== i + 1) {
      return { valid: false, error: 'sort_order must be 1, 2, 3, … with no gaps.' }
    }
    if (i > 0 && sorted[i].min_percentage >= sorted[i - 1].min_percentage) {
      return {
        valid: false,
        error: `${sorted[i].letter} min% (${sorted[i].min_percentage}) must be lower than ${sorted[i - 1].letter} (${sorted[i - 1].min_percentage}).`,
      }
    }
  }
  if (sorted[sorted.length - 1].min_percentage !== 0) {
    return {
      valid: false,
      error: 'Lowest letter must start at 0 so every percentage maps to a letter.',
    }
  }
  return { valid: true }
}

/** Legacy GradeLetter type — kept for backward compatibility with callers that still expect the union. */
export function asLegacyLetter(letter: string): GradeLetter {
  return letter as GradeLetter
}
