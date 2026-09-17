import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/types/database.types'

type Tables = Database['public']['Tables']
export type AssessmentRow = Tables['assessments']['Row']
export type MarkRow = Tables['marks']['Row']
export type MarkCorrectionRow = Tables['mark_corrections']['Row']
export type ProfileRow = Tables['profiles']['Row']
export type EnrollmentRow = Tables['enrollments']['Row']
export type FacultyAssignmentRow = Tables['faculty_assignments']['Row']
export type SubjectRow = Tables['subjects']['Row']
export type SectionRow = Tables['sections']['Row']
export type AssessmentType = Database['public']['Enums']['assessment_type']

export interface MarksData {
  assessments: AssessmentRow[]
  marks: MarkRow[]
  corrections: MarkCorrectionRow[]
  profiles: ProfileRow[]
  enrollments: EnrollmentRow[]
  assignments: FacultyAssignmentRow[]
  subjects: SubjectRow[]
  sections: SectionRow[]
}

export interface AssessmentInput {
  id?: string
  title: string
  assessmentType: AssessmentType
  subjectId: string
  sectionId: string
  /** Faculty who handles this subject and section, and who will enter and finalize the marks. */
  facultyId: string
  maximumMarks: number
  assessmentDate: string
}

export interface DraftMarkInput {
  studentId: string
  obtainedMarks: number | null
  absent: boolean
  entered: boolean
}

const client = () => {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

const fail = (error: { message: string; code?: string } | null, fallback: string) => {
  if (!error) return
  if (error.code === '23505' || /duplicate|unique/i.test(error.message)) throw new Error('A matching assessment or mark record already exists.')
  if (/row-level|policy|permission|authorized/i.test(error.message)) throw new Error('You are not authorized to perform this marks action.')
  if (/finalized|locked/i.test(error.message)) throw new Error('Finalized marks are read-only. Use the correction workflow.')
  if (/maximum_marks|cannot exceed/i.test(error.message)) throw new Error('Obtained marks cannot exceed the assessment maximum.')
  if (/every active student/i.test(error.message)) throw new Error('Enter a mark or Absent for every active enrolled student before finalizing.')
  throw new Error(error.message || fallback)
}

async function currentUser() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new Error('Please sign in again to continue.')
  return data.user
}

async function selectAll<Name extends keyof Tables>(table: Name): Promise<Tables[Name]['Row'][]> {
  const { data, error } = await client().from(table).select('*')
  fail(error, `Unable to load ${table}.`)
  return data as unknown as Tables[Name]['Row'][]
}

async function assessmentForWrite(assessmentId: string): Promise<AssessmentRow> {
  const { data, error } = await client().from('assessments').select('*').eq('id', assessmentId).maybeSingle()
  fail(error, 'Unable to load the assessment.')
  if (!data) throw new Error('Assessment not found.')
  if (data.status === 'finalized') throw new Error('Finalized marks are read-only. Use the correction workflow.')
  return data
}

async function verifyAssignment(userId: string, sectionId: string, subjectId: string) {
  const { data, error } = await client()
    .from('faculty_assignments')
    .select('id,subject_id,assignment_type')
    .eq('faculty_id', userId)
    .eq('section_id', sectionId)
    .eq('is_active', true)
  fail(error, 'Unable to verify the Faculty assignment.')
  if (!(data ?? []).some((row) => row.subject_id === subjectId || row.assignment_type === 'class_teacher')) {
    throw new Error('This subject and section are outside your active Faculty assignment.')
  }
}

/** Assessment creation belongs to the Super Admin; Faculty only enter and finalize marks. */
async function verifyAssessmentManager() {
  const user = await currentUser()
  const { data, error } = await client().from('profiles').select('role').eq('id', user.id).maybeSingle()
  fail(error, 'Unable to verify your role.')
  if (data?.role !== 'super_admin') throw new Error('Only the Super Admin can create or edit assessments.')
}

/** The assigned Faculty owns mark entry and is the only role the finalize RPC accepts. */
async function verifyAssignedFaculty(facultyId: string, sectionId: string, subjectId: string) {
  const { data, error } = await client().from('profiles').select('role,status').eq('id', facultyId).maybeSingle()
  fail(error, 'Unable to load the assigned Faculty profile.')
  if (!data || data.role !== 'faculty' || data.status !== 'active') throw new Error('Select an active Faculty member for this assessment.')
  const assignment = await client()
    .from('faculty_assignments')
    .select('id')
    .eq('faculty_id', facultyId)
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId)
    .eq('is_active', true)
  fail(assignment.error, 'Unable to verify the Faculty assignment.')
  if (!(assignment.data ?? []).length) throw new Error('The selected Faculty member does not hold an active assignment for this subject and section.')
}

export const marksRepository = {
  async loadMarksData(): Promise<MarksData> {
    const [assessments, marks, corrections, profiles, enrollments, assignments, subjects, sections] = await Promise.all([
      selectAll('assessments'),
      selectAll('marks'),
      selectAll('mark_corrections'),
      selectAll('profiles'),
      selectAll('enrollments'),
      selectAll('faculty_assignments'),
      selectAll('subjects'),
      selectAll('sections'),
    ])
    return { assessments, marks, corrections, profiles, enrollments, assignments, subjects, sections }
  },

  async saveAssessment(input: AssessmentInput): Promise<AssessmentRow> {
    const title = input.title.trim()
    if (!title) throw new Error('Enter an assessment title.')
    if (!input.subjectId || !input.sectionId || !input.assessmentDate) throw new Error('Select a subject, section, and assessment date.')
    if (!input.facultyId) throw new Error('Select the Faculty member who handles this subject and section.')
    if (!Number.isFinite(input.maximumMarks) || input.maximumMarks <= 0) throw new Error('Maximum marks must be greater than zero.')
    await verifyAssessmentManager()
    await verifyAssignedFaculty(input.facultyId, input.sectionId, input.subjectId)

    const duplicateQuery = client()
      .from('assessments')
      .select('id')
      .eq('subject_id', input.subjectId)
      .eq('section_id', input.sectionId)
      .eq('title', title)
      .eq('assessment_date', input.assessmentDate)
    const { data: duplicates, error: duplicateError } = input.id
      ? await duplicateQuery.neq('id', input.id)
      : await duplicateQuery
    fail(duplicateError, 'Unable to check for duplicate assessments.')
    if ((duplicates ?? []).length) throw new Error('An assessment with this subject, section, title, and date already exists.')

    if (input.id) {
      await assessmentForWrite(input.id)
      const { data: marks, error: marksError } = await client().from('marks').select('obtained_marks').eq('assessment_id', input.id).eq('absent', false)
      fail(marksError, 'Unable to validate existing marks.')
      const highest = Math.max(0, ...(marks ?? []).map((row) => Number(row.obtained_marks ?? 0)))
      if (input.maximumMarks < highest) throw new Error(`Maximum marks cannot be lower than an existing mark of ${highest}.`)
      const { data, error } = await client().from('assessments').update({
        title,
        assessment_type: input.assessmentType,
        subject_id: input.subjectId,
        section_id: input.sectionId,
        faculty_id: input.facultyId,
        maximum_marks: input.maximumMarks,
        assessment_date: input.assessmentDate,
      }).eq('id', input.id).select().single()
      fail(error, 'Unable to update the assessment.')
      if (!data) throw new Error('Unable to update the assessment.')
      return data
    }

    const { data, error } = await client().from('assessments').insert({
      faculty_id: input.facultyId,
      title,
      assessment_type: input.assessmentType,
      subject_id: input.subjectId,
      section_id: input.sectionId,
      maximum_marks: input.maximumMarks,
      assessment_date: input.assessmentDate,
    }).select().single()
    fail(error, 'Unable to create the assessment.')
    if (!data) throw new Error('Unable to create the assessment.')
    return data
  },

  async saveDraftMarks(assessmentId: string, inputs: DraftMarkInput[]): Promise<void> {
    const user = await currentUser()
    const assessment = await assessmentForWrite(assessmentId)
    await verifyAssignment(user.id, assessment.section_id, assessment.subject_id)
    const { data: enrollments, error: enrollmentError } = await client()
      .from('enrollments')
      .select('student_id')
      .eq('section_id', assessment.section_id)
      .eq('status', 'active')
    fail(enrollmentError, 'Unable to validate active enrollments.')
    const activeIds = new Set((enrollments ?? []).map((row) => row.student_id))
    for (const input of inputs) {
      if (!activeIds.has(input.studentId)) throw new Error('Marks can be entered only for active enrolled students.')
      const { data: existing, error: existingError } = await client().from('marks').select('id').eq('assessment_id', assessment.id).eq('student_id', input.studentId).maybeSingle()
      fail(existingError, 'Unable to check the mark record.')
      if (!input.entered) {
        if (existing) {
          const { error } = await client().from('marks').delete().eq('id', existing.id)
          fail(error, 'Unable to return the mark to Not entered.')
        }
        continue
      }
      if (!input.absent && (input.obtainedMarks === null || !Number.isFinite(input.obtainedMarks) || input.obtainedMarks < 0 || input.obtainedMarks > assessment.maximum_marks)) {
        throw new Error(`Marks must be between 0 and ${assessment.maximum_marks}.`)
      }
      const payload = {
        assessment_id: assessment.id,
        student_id: input.studentId,
        obtained_marks: input.absent ? null : input.obtainedMarks,
        absent: input.absent,
        is_locked: false,
      }
      const result = existing
        ? await client().from('marks').update(payload).eq('id', existing.id)
        : await client().from('marks').insert(payload)
      fail(result.error, 'Unable to save draft marks.')
    }
    const { count, error: countError } = await client().from('marks').select('id', { count: 'exact', head: true }).eq('assessment_id', assessment.id)
    fail(countError, 'Unable to count entered marks.')
    const complete = (count ?? 0) >= activeIds.size && activeIds.size > 0
    const { error: statusError } = await client().from('assessments').update({ status: complete ? 'completed' : 'draft' }).eq('id', assessment.id)
    fail(statusError, 'Marks were saved, but the assessment status could not be updated.')
  },

  async finalizeMarks(assessmentId: string): Promise<void> {
    const { error } = await client().rpc('finalize_marks', { p_assessment_id: assessmentId })
    fail(error, 'Unable to finalize marks.')
  },

  async requestCorrection(mark: MarkRow, requestedMarks: number | null, reason: string): Promise<void> {
    const user = await currentUser()
    if (mark.student_id !== user.id) throw new Error('Students may request corrections only for their own marks.')
    const assessment = await client().from('assessments').select('faculty_id,maximum_marks,status').eq('id', mark.assessment_id).maybeSingle()
    fail(assessment.error, 'Unable to load the assessment.')
    if (!assessment.data) throw new Error('Assessment not found.')
    if (assessment.data.status !== 'finalized') throw new Error('Correction requests are available after marks are finalized.')
    if (requestedMarks !== null && (!Number.isFinite(requestedMarks) || requestedMarks < 0 || requestedMarks > assessment.data.maximum_marks)) {
      throw new Error(`Requested marks must be between 0 and ${assessment.data.maximum_marks}, or Absent.`)
    }
    if (requestedMarks === mark.obtained_marks) throw new Error('Request a different mark or Absent status.')
    if (reason.trim().length < 3) throw new Error('Enter a correction reason with at least three characters.')
    const history: Json = [{ action: 'requested', actor_id: user.id, created_at: new Date().toISOString() }]
    const { error } = await client().from('mark_corrections').insert({
      mark_id: mark.id,
      student_id: mark.student_id,
      original_marks: mark.obtained_marks,
      requested_marks: requestedMarks,
      reason: reason.trim(),
      requester_id: user.id,
      reviewer_id: assessment.data.faculty_id,
      history,
    })
    fail(error, 'Unable to submit the mark correction.')
  },

  async reviewCorrection(correctionId: string, approve: boolean, comments?: string): Promise<void> {
    const args = comments?.trim()
      ? { p_correction_id: correctionId, p_approve: approve, p_comments: comments.trim() }
      : { p_correction_id: correctionId, p_approve: approve }
    const { error } = await client().rpc('approve_mark_correction', args)
    fail(error, 'Unable to review the mark correction.')
  },

  /** Super Admin only. Finalizes every assessment for the section so no Faculty can edit marks again. */
  async lockMarksForSection(sectionId: string): Promise<number> {
    const { data, error } = await client().rpc('lock_marks_for_section', { p_section_id: sectionId })
    fail(error, 'Unable to lock this class’s marks.')
    return data ?? 0
  },

  /** Super Admin only. Reverses a lock placed by mistake. */
  async unlockMarksForSection(sectionId: string): Promise<number> {
    const { data, error } = await client().rpc('unlock_marks_for_section', { p_section_id: sectionId })
    fail(error, 'Unable to unlock this class’s marks.')
    return data ?? 0
  },
}
