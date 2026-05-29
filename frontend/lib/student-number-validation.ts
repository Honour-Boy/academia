// Validate that a student's number reflects when they entered the school,
// given their current class level and the school's current academic year.
//
// Convention agreed with the user (Nigerian secondary school year):
//   academic year "2025/2026" → "school year" anchors to the SECOND year (2026).
//   JSS 1 students entered in 2025 → lastYear − 1 = 2025
//   JSS 2 students entered in 2024 → lastYear − 2 = 2024
//   JSS 3 entered 2023, SS 1 = 2022, SS 2 = 2021, SS 3 = 2020.
//
// The student-number's first 4 digits are taken as the entry year (the school
// uses formats like "2023/mds/023" or "2024/JSS/001"). If the number doesn't
// start with 4 digits we skip validation — older legacy formats slip through.
//
// Returns { valid: boolean, expectedYear: number | null, foundYear: number | null,
//           reason: string | null } so callers can surface a friendly message.

export interface StudentNumberCheck {
  valid: boolean
  expectedYear: number | null
  foundYear: number | null
  reason: string | null
}

const LEVEL_OFFSET: Record<string, number> = {
  'JSS 1': 1,
  'JSS 2': 2,
  'JSS 3': 3,
  'SS 1': 4,
  'SS 2': 5,
  'SS 3': 6,
}

export function lastYearOfAcademicYear(academicYear: string): number | null {
  // Expect "YYYY/YYYY" — pull the trailing year.
  const m = /^(\d{4})\/(\d{4})$/.exec(academicYear.trim())
  if (!m) return null
  const start = parseInt(m[1], 10)
  const end = parseInt(m[2], 10)
  if (end !== start + 1) return null
  return end
}

export function expectedEntryYear(
  classLevel: string,
  academicYear: string,
): number | null {
  const lastYear = lastYearOfAcademicYear(academicYear)
  if (lastYear === null) return null
  const offset = LEVEL_OFFSET[classLevel.trim()]
  if (offset === undefined) return null
  return lastYear - offset
}

export function validateStudentNumber(
  studentNumber: string | null | undefined,
  classLevel: string | null | undefined,
  academicYear: string | null | undefined,
): StudentNumberCheck {
  const trimmed = (studentNumber ?? '').trim()
  if (!trimmed) {
    // No number provided → admin opted out; nothing to validate.
    return { valid: true, expectedYear: null, foundYear: null, reason: null }
  }
  if (!classLevel || !academicYear) {
    return { valid: true, expectedYear: null, foundYear: null, reason: null }
  }

  // Find the FIRST 4-digit token in the number. Handles "2024/JSS/001",
  // "JSS-2024-001", "24/JSS/001" (no — 2-digit fails on purpose).
  const m = /(\d{4})/.exec(trimmed)
  if (!m) {
    // No 4-digit year → can't validate; skip rather than block.
    return { valid: true, expectedYear: null, foundYear: null, reason: null }
  }
  const foundYear = parseInt(m[1], 10)
  const expectedYear = expectedEntryYear(classLevel, academicYear)
  if (expectedYear === null) {
    return { valid: true, expectedYear: null, foundYear, reason: null }
  }
  if (foundYear === expectedYear) {
    return { valid: true, expectedYear, foundYear, reason: null }
  }

  const lastYear = lastYearOfAcademicYear(academicYear)!
  const offset = LEVEL_OFFSET[classLevel.trim()]!
  return {
    valid: false,
    expectedYear,
    foundYear,
    reason:
      `Student number year (${foundYear}) doesn't match ${classLevel} for ${academicYear}. ` +
      `${classLevel} entered school in ${expectedYear} (${lastYear} − ${offset}).`,
  }
}
