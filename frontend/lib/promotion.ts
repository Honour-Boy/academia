// Pure helpers for the year-rollover promotion wizard. No I/O — given a
// student's current class level (e.g. "JSS 1"), returns the next level they
// should promote to ("JSS 2"), or marks them as graduating from SS 3.

export type PromotionTarget =
  | { kind: 'level'; nextLevel: string }
  | { kind: 'graduate' }
  | { kind: 'unknown' }

const PROGRESSION = [
  'JSS 1',
  'JSS 2',
  'JSS 3',
  'SS 1',
  'SS 2',
  'SS 3',
] as const

/** Normalize "jss1", "JSS  1", "Jss1A" to "JSS 1" — match school's seed format. */
function normalizeLevel(input: string): string {
  const m = input.toUpperCase().replace(/\s+/g, '').match(/^(JSS|SS)([123])/)
  if (!m) return input.trim().toUpperCase()
  return `${m[1]} ${m[2]}`
}

export function nextLevel(currentLevel: string): PromotionTarget {
  const norm = normalizeLevel(currentLevel)
  const idx = PROGRESSION.indexOf(norm as (typeof PROGRESSION)[number])
  if (idx === -1) return { kind: 'unknown' }
  if (idx === PROGRESSION.length - 1) return { kind: 'graduate' } // SS 3 → graduate
  return { kind: 'level', nextLevel: PROGRESSION[idx + 1] }
}
