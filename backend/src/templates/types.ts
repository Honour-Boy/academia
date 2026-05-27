// ─────────────────────────────────────────────────────────────────────────────
// Template system types
//
// A "template" is a JSON descriptor that maps our DB fields to positions on
// a school report sheet. If a template references a field we don't have,
// the generator gracefully omits it — never crashes.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'number'
  | 'grade_letter'
  | 'behaviour_rating'
  | 'date'

/** A single placeable field in the report template. */
export interface TemplateField {
  /** Unique key that maps to our data model (e.g. "student.full_name") */
  key: string
  label: string
  type: FieldType
  /** Whether to hide the entire row if the value is null/empty */
  omitIfEmpty?: boolean
  /** Max character length for text fields — truncate gracefully */
  maxLength?: number
}

/** A group of fields (e.g. "Subject Scores", "Attendance") */
export interface TemplateSection {
  id: string
  title: string
  fields: TemplateField[]
  /** If true and ALL fields are empty, skip the entire section */
  omitIfEmpty?: boolean
}

/** The full report template descriptor */
export interface ReportTemplate {
  version: number
  name: string
  sections: TemplateSection[]
}

// ─── Known field keys ─────────────────────────────────────────────────────────
// These are the fields our data model CAN populate.
// Any key in the template NOT in this set is silently omitted.

export const KNOWN_FIELD_KEYS = new Set([
  'student.full_name',
  'student.student_number',
  'student.class_name',
  'student.class_level',
  'class_teacher.full_name',
  'report.term',
  'report.academic_year',
  // Subjects dynamic — resolved at generation time
  'subjects.*',
  // Attendance
  'attendance.times_present',
  'attendance.times_absent',
  'attendance.times_late',
  // Remarks
  'remarks.behaviour_rating',
  'remarks.teacher_remark',
  'remarks.principal_remark',
  // Computed
  'report.overall_total',
  'report.overall_percentage',
  'report.position',
])
