'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function upsertGradeAction(
  studentId: string,
  subjectId: string,
  classId: string,
  componentId: string,
  score: number | null,
  term: string,
  academicYear: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (score !== null) {
    // Validate component max score server-side
    const { data: comp } = await supabase
      .from('score_components')
      .select('max_score')
      .eq('id', componentId)
      .single()

    if (comp && score > comp.max_score) {
      return { error: `Score exceeds maximum of ${comp.max_score}` }
    }
    if (score < 0) return { error: 'Score cannot be negative' }
  }

  const { error } = await supabase.from('grades').upsert(
    {
      student_id:    studentId,
      subject_id:    subjectId,
      class_id:      classId,
      component_id:  componentId,
      score,
      term,
      academic_year: academicYear,
      entered_by:    user.id,
    },
    { onConflict: 'student_id,subject_id,component_id,term,academic_year' }
  )

  if (error) {
    console.error('[upsertGrade]', error.message)
    return { error: 'Failed to save grade. Please try again.' }
  }

  revalidatePath(`/grades/${classId}/${subjectId}`)
  return {}
}

export async function bulkUpsertGradesAction(
  grades: Array<{
    studentId: string
    subjectId: string
    classId: string
    componentId: string
    score: number | null
  }>,
  term: string,
  academicYear: string
): Promise<{ error?: string; saved: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', saved: 0 }

  const rows = grades.map((g) => ({
    student_id:    g.studentId,
    subject_id:    g.subjectId,
    class_id:      g.classId,
    component_id:  g.componentId,
    score:         g.score,
    term,
    academic_year: academicYear,
    entered_by:    user.id,
  }))

  const { error } = await supabase.from('grades').upsert(rows, {
    onConflict: 'student_id,subject_id,component_id,term,academic_year',
  })

  if (error) {
    console.error('[bulkUpsertGrades]', error.message)
    return { error: 'Failed to save grades.', saved: 0 }
  }

  if (grades[0]) revalidatePath(`/grades/${grades[0].classId}/${grades[0].subjectId}`)
  return { saved: rows.length }
}
