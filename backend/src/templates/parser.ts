import type { ReportTemplate, TemplateField } from './types'
import { KNOWN_FIELD_KEYS } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Template parser
//
// Validates a template descriptor and strips any field that:
//   1. Has a key not in KNOWN_FIELD_KEYS
//   2. References a subject/* wildcard we can't resolve
//
// Design goal: never throw on bad input — always return a usable (possibly
// reduced) template so report generation can continue.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParseResult {
  template: ReportTemplate
  /** Fields that were in the source but silently omitted */
  omitted: string[]
  warnings: string[]
}

/**
 * Parse and sanitise a raw template object.
 * Unknown fields are omitted rather than crashing the generator.
 */
export function parseTemplate(raw: unknown): ParseResult {
  const omitted: string[] = []
  const warnings: string[] = []

  // ── Basic structure validation ─────────────────────────────────────────────
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('Template is not an object — using default template')
    return { template: defaultTemplate(), omitted, warnings }
  }

  const obj = raw as Record<string, unknown>

  if (!Array.isArray(obj.sections)) {
    warnings.push('Template missing sections array — using default template')
    return { template: defaultTemplate(), omitted, warnings }
  }

  // ── Strip unknown fields from every section ────────────────────────────────
  const sections = (obj.sections as unknown[])
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((section) => {
      const rawFields = Array.isArray(section.fields) ? section.fields : []

      const knownFields: TemplateField[] = []

      for (const f of rawFields) {
        if (typeof f !== 'object' || f === null) continue
        const field = f as Record<string, unknown>
        const key = typeof field.key === 'string' ? field.key : ''

        const isKnown =
          KNOWN_FIELD_KEYS.has(key) ||
          (key.startsWith('subjects.') && KNOWN_FIELD_KEYS.has('subjects.*'))

        if (!isKnown) {
          omitted.push(key || '(unnamed field)')
          continue
        }

        knownFields.push({
          key,
          label: typeof field.label === 'string' ? field.label : key,
          type: (['text', 'number', 'grade_letter', 'behaviour_rating', 'date'].includes(
            field.type as string,
          )
            ? field.type
            : 'text') as TemplateField['type'],
          omitIfEmpty: field.omitIfEmpty === true,
          maxLength:
            typeof field.maxLength === 'number' ? field.maxLength : undefined,
        })
      }

      return {
        id: typeof section.id === 'string' ? section.id : crypto.randomUUID(),
        title: typeof section.title === 'string' ? section.title : 'Section',
        fields: knownFields,
        omitIfEmpty: section.omitIfEmpty === true,
      }
    })
    // Drop sections that ended up with zero known fields
    .filter((s) => s.fields.length > 0)

  if (omitted.length > 0) {
    warnings.push(
      `${omitted.length} unrecognised field(s) omitted: ${omitted.slice(0, 5).join(', ')}${omitted.length > 5 ? '…' : ''}`,
    )
  }

  return {
    template: {
      version: typeof obj.version === 'number' ? obj.version : 1,
      name: typeof obj.name === 'string' ? obj.name : 'Report Sheet',
      sections,
    },
    omitted,
    warnings,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default template — used when no custom template is provided
// ─────────────────────────────────────────────────────────────────────────────

export function defaultTemplate(): ReportTemplate {
  return {
    version: 1,
    name: 'Default Report Sheet',
    sections: [
      {
        id: 'student_info',
        title: 'Student Information',
        omitIfEmpty: false,
        fields: [
          { key: 'student.full_name',     label: 'Name',            type: 'text' },
          { key: 'student.student_number',label: 'Student No.',     type: 'text',   omitIfEmpty: true },
          { key: 'student.class_name',    label: 'Class',           type: 'text' },
          { key: 'class_teacher.full_name', label: 'Class Teacher', type: 'text',   omitIfEmpty: true },
          { key: 'report.term',           label: 'Term',            type: 'text' },
          { key: 'report.academic_year',  label: 'Academic Year',   type: 'text' },
        ],
      },
      {
        id: 'subjects',
        title: 'Subject Scores',
        omitIfEmpty: false,
        fields: [
          { key: 'subjects.name',              label: 'Subject',    type: 'text' },
          { key: 'subjects.ca1',               label: 'CA 1 (/20)', type: 'number', omitIfEmpty: true },
          { key: 'subjects.ca2',               label: 'CA 2 (/20)', type: 'number', omitIfEmpty: true },
          { key: 'subjects.exam',              label: 'Exam (/60)', type: 'number', omitIfEmpty: true },
          { key: 'subjects.total',             label: 'Total',      type: 'number' },
          { key: 'subjects.grade',             label: 'Grade',      type: 'grade_letter' },
        ],
      },
      {
        id: 'overall',
        title: 'Overall',
        omitIfEmpty: true,
        fields: [
          { key: 'report.overall_total',      label: 'Total Score',  type: 'number', omitIfEmpty: true },
          { key: 'report.overall_percentage', label: 'Average (%)',  type: 'number', omitIfEmpty: true },
          { key: 'report.position',           label: 'Position',     type: 'text',   omitIfEmpty: true },
        ],
      },
      {
        id: 'attendance',
        title: 'Attendance',
        omitIfEmpty: true,
        fields: [
          { key: 'attendance.times_present', label: 'Times Present', type: 'number', omitIfEmpty: true },
          { key: 'attendance.times_absent',  label: 'Times Absent',  type: 'number', omitIfEmpty: true },
          { key: 'attendance.times_late',    label: 'Times Late',    type: 'number', omitIfEmpty: true },
        ],
      },
      {
        id: 'remarks',
        title: 'Remarks',
        omitIfEmpty: true,
        fields: [
          { key: 'remarks.behaviour_rating', label: 'Behaviour',            type: 'behaviour_rating', omitIfEmpty: true },
          { key: 'remarks.teacher_remark',   label: "Class Teacher's Remark", type: 'text',           omitIfEmpty: true },
          { key: 'remarks.principal_remark', label: "Principal's Remark",   type: 'text',             omitIfEmpty: true, maxLength: 500 },
        ],
      },
    ],
  }
}
