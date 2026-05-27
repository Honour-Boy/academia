export type UserRole = 'ADMIN' | 'TEACHER'

// Nigerian WAEC-style grade letters
export type GradeLetter = 'A1' | 'B2' | 'B3' | 'C4' | 'C5' | 'C6' | 'D7' | 'E8' | 'F9'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Class {
  id: string
  name: string
  level: string
  arm: string
  created_by: string | null
  created_at: string
}

export interface Subject {
  id: string
  name: string
  created_at: string
}

export interface TeacherAssignment {
  id: string
  teacher_id: string
  class_id: string
  subject_id: string
  term: string
  academic_year: string
  created_at: string
  // joined
  classes?: Class
  subjects?: Subject
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'>
}

export interface Student {
  id: string
  full_name: string
  student_number: string | null
  class_id: string
  is_active: boolean
  created_at: string
}

export interface ScoreComponent {
  id: string
  name: string
  max_score: number
  weight_percentage: number
  sort_order: number
}

export interface Grade {
  id: string
  student_id: string
  subject_id: string
  class_id: string
  component_id: string
  score: number | null
  term: string
  academic_year: string
  entered_by: string | null
  created_at: string
  updated_at: string
}

export interface GradeAuditLog {
  id: string
  grade_id: string
  changed_by: string | null
  changed_by_name: string | null
  old_score: number | null
  new_score: number | null
  action: 'INSERT' | 'UPDATE'
  changed_at: string
}

// Computed display row for grade entry and reports
export interface StudentGradeRow {
  student: Student
  scores: Record<string, number | null> // componentId -> score
  total: number
  percentage: number
  gradeLetter: GradeLetter
  isComplete: boolean // all components have a score
}

// Admin dashboard stats
export interface AdminStats {
  totalTeachers: number
  totalClasses: number
  totalStudents: number
  totalGradesEntered: number
}
