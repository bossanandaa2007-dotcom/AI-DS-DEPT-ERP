import { supabase } from '@/lib/supabase'
import { readableSupabaseError } from '@/services/supabase/query'
import type { Database, Json } from '@/types/database.types'

type Tables = Database['public']['Tables']
export type AttendanceSessionRow = Tables['attendance_sessions']['Row']
export type AttendanceRecordRow = Tables['attendance_records']['Row']
export type AttendanceCorrectionRow = Tables['attendance_corrections']['Row']
export type StaffAttendanceRow = Tables['staff_attendance']['Row']
export type AttendanceStatus = Database['public']['Enums']['attendance_status']
export type AttendanceSessionStatus = Database['public']['Enums']['attendance_session_status']
export type ProfileRow = Tables['profiles']['Row']
export type EnrollmentRow = Tables['enrollments']['Row']
export type TimetableRow = Tables['timetable_entries']['Row']
export type SubjectRow = Tables['subjects']['Row']
export type SectionRow = Tables['sections']['Row']
export type FacultyAssignmentRow = Tables['faculty_assignments']['Row']
export type RequestRow = Tables['requests']['Row']

export interface AttendanceData {
  departments: Tables['departments']['Row'][]
  academicYears: Tables['academic_years']['Row'][]
  semesters: Tables['semesters']['Row'][]
  sessions: AttendanceSessionRow[]
  records: AttendanceRecordRow[]
  corrections: AttendanceCorrectionRow[]
  staffAttendance: StaffAttendanceRow[]
  profiles: ProfileRow[]
  enrollments: EnrollmentRow[]
  timetable: TimetableRow[]
  subjects: SubjectRow[]
  sections: SectionRow[]
  assignments: FacultyAssignmentRow[]
  requests: RequestRow[]
}

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const message = (error: { message: string; code?: string } | null, fallback: string) => {
  if (!error) return
  if (error.code === '23505' || /duplicate|unique/i.test(error.message)) throw new Error('This attendance entry already exists.')
  if (/finalized|locked/i.test(error.message)) throw new Error('Finalized attendance is locked. Submit or approve a correction instead.')
  throw new Error(readableSupabaseError(error, 'attendance', fallback))
}
async function currentUser() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new Error('Please sign in again to continue.')
  return data.user
}
async function selectAll<Name extends keyof Tables>(table: Name): Promise<Tables[Name]['Row'][]> {
  const { data, error } = await client().from(table).select('*')
  message(error, `Unable to load ${table}.`)
  return data as unknown as Tables[Name]['Row'][]
}
const dayOfWeek = (date: string) => { const day = new Date(`${date}T00:00:00`).getDay(); return day === 0 ? 7 : day }
const inEffect = (entry: TimetableRow, date: string) => entry.effective_from <= date && (!entry.effective_to || entry.effective_to >= date)

async function validateFacultySessionWrite(session: AttendanceSessionRow) {
  const user = await currentUser()
  if (session.faculty_id !== user.id) throw new Error('This attendance session is outside your Faculty assignment.')
  if (session.status === 'finalized' || session.status === 'locked') throw new Error('Finalized attendance is read-only.')
  const query = client().from('faculty_assignments').select('id,subject_id,assignment_type').eq('faculty_id', user.id).eq('section_id', session.section_id).eq('is_active', true)
  const { data, error } = session.subject_id ? await query.eq('subject_id', session.subject_id) : await query.eq('assignment_type', 'class_teacher')
  message(error, 'Unable to verify the Faculty assignment.')
  if (!(data ?? []).length) throw new Error('This attendance session is outside your active Faculty assignment.')
}

export const attendanceRepository = {
  async loadAttendanceData(): Promise<AttendanceData> {
    const [departments, academicYears, semesters, sessions, records, corrections, staffAttendance, profiles, enrollments, timetable, subjects, sections, assignments, requests] = await Promise.all([
      selectAll('departments'),
      selectAll('academic_years'),
      selectAll('semesters'),
      selectAll('attendance_sessions'),
      selectAll('attendance_records'),
      selectAll('attendance_corrections'),
      selectAll('staff_attendance'),
      selectAll('profiles'),
      selectAll('enrollments'),
      selectAll('timetable_entries'),
      selectAll('subjects'),
      selectAll('sections'),
      selectAll('faculty_assignments'),
      selectAll('requests'),
    ])
    return { departments, academicYears, semesters, sessions, records, corrections, staffAttendance, profiles, enrollments, timetable, subjects, sections, assignments, requests }
  },

  async openSubjectSession(timetableEntryId: string, attendanceDate: string): Promise<AttendanceSessionRow> {
    const user = await currentUser()
    const { data: entry, error: entryError } = await client().from('timetable_entries').select('*').eq('id', timetableEntryId).maybeSingle()
    message(entryError, 'Unable to load the timetable entry.')
    if (!entry) throw new Error('Timetable entry was not found.')
    if (!entry.is_active || entry.faculty_id !== user.id || entry.day_of_week !== dayOfWeek(attendanceDate) || !inEffect(entry, attendanceDate)) throw new Error('This timetable period is outside your active Faculty assignment.')
    const { data: assignment, error: assignmentError } = await client().from('faculty_assignments').select('id').eq('faculty_id', user.id).eq('section_id', entry.section_id).eq('subject_id', entry.subject_id).eq('is_active', true)
    message(assignmentError, 'Unable to verify the Faculty assignment.')
    if (!(assignment ?? []).length) throw new Error('This timetable period is outside your active Faculty assignment.')
    const sessionType: Database['public']['Enums']['attendance_session_type'] = entry.lab ? 'lab' : 'subject'
    const existing = await client().from('attendance_sessions').select('*').eq('section_id', entry.section_id).eq('subject_id', entry.subject_id).eq('attendance_date', attendanceDate).eq('period', entry.period).eq('session_type', sessionType).maybeSingle()
    message(existing.error, 'Unable to check existing attendance.')
    if (existing.data) {
      if (existing.data.faculty_id !== user.id) throw new Error('Attendance for this period belongs to another authorized Faculty member.')
      return existing.data
    }
    const { data, error } = await client().from('attendance_sessions').insert({
      session_type: sessionType,
      timetable_entry_id: entry.id,
      section_id: entry.section_id,
      subject_id: entry.subject_id,
      faculty_id: user.id,
      attendance_date: attendanceDate,
      period: entry.period,
      status: 'open',
    }).select().single()
    message(error, 'Unable to open attendance for this period.')
    if (!data) throw new Error('Unable to open attendance for this period.')
    return data
  },

  async openDailySession(sectionId: string, attendanceDate: string): Promise<AttendanceSessionRow> {
    const user = await currentUser()
    const { data: assignment, error: assignmentError } = await client().from('faculty_assignments').select('id').eq('faculty_id', user.id).eq('section_id', sectionId).eq('assignment_type', 'class_teacher').eq('is_active', true)
    message(assignmentError, 'Unable to verify the Class Teacher assignment.')
    if (!(assignment ?? []).length) throw new Error('Only the assigned Class Teacher can open daily attendance.')
    const existing = await client().from('attendance_sessions').select('*').eq('section_id', sectionId).eq('attendance_date', attendanceDate).eq('session_type', 'daily').maybeSingle()
    message(existing.error, 'Unable to check existing daily attendance.')
    if (existing.data) {
      if (existing.data.faculty_id !== user.id) throw new Error('Daily attendance for this section belongs to another authorized Faculty member.')
      return existing.data
    }
    const { data, error } = await client().from('attendance_sessions').insert({
      session_type: 'daily',
      section_id: sectionId,
      faculty_id: user.id,
      attendance_date: attendanceDate,
      status: 'open',
    }).select().single()
    message(error, 'Unable to open daily attendance. Only the assigned Class Teacher can do this.')
    if (!data) throw new Error('Unable to open daily attendance.')
    return data
  },

  async studentDailyCheckIn(sessionId: string): Promise<AttendanceRecordRow> {
    const { data, error } = await client().rpc('student_daily_check_in' as never, { p_session_id: sessionId } as never)
    message(error, 'Unable to record the student check-in.')
    if (!data) throw new Error('Unable to record the student check-in.')
    return data as AttendanceRecordRow
  },

  async saveAttendanceRecord(session: AttendanceSessionRow, studentId: string, status: AttendanceStatus): Promise<void> {
    await this.saveAttendanceRecords(session, { [studentId]: status })
  },

  async saveAllAttendance(session: AttendanceSessionRow, students: ProfileRow[], status: AttendanceStatus): Promise<void> {
    if (session.status === 'finalized' || session.status === 'locked') throw new Error('Finalized attendance is read-only.')
    await this.saveAttendanceRecords(session, Object.fromEntries(students.map((student) => [student.id, status])))
  },

  async saveAttendanceRecords(session: AttendanceSessionRow, statusesByStudent: Record<string, AttendanceStatus>): Promise<void> {
    await validateFacultySessionWrite(session)
    const studentIds = Object.keys(statusesByStudent)
    if (!studentIds.length) return
    const enrolled = await client().from('enrollments').select('student_id').eq('section_id', session.section_id).eq('status', 'active').in('student_id', studentIds)
    message(enrolled.error, 'Unable to validate student enrollment.')
    const enrolledIds = new Set((enrolled.data ?? []).map((row) => row.student_id))
    if (studentIds.some((studentId) => !enrolledIds.has(studentId))) throw new Error('One or more students are not actively enrolled in this section.')
    const payload = studentIds.map((studentId) => ({ session_id: session.id, student_id: studentId, status: statusesByStudent[studentId] }))
    const { error } = await client().from('attendance_records').upsert(payload, { onConflict: 'session_id,student_id' })
    message(error, 'Unable to save attendance.')
  },

  async verifyDailyRecord(recordId: string, status: AttendanceStatus): Promise<void> {
    const user = await currentUser()
    const verifiedAt = new Date().toISOString()
    const verification: Json = { verification_state: 'verified', verified_by: user.id, verified_at: verifiedAt }
    const { error } = await client().from('attendance_records').update({ status, verification_data: verification }).eq('id', recordId)
    message(error, 'Unable to verify the daily check-in.')
  },

  async finalizeSession(sessionId: string): Promise<void> {
    const { data: session, error: sessionError } = await client().from('attendance_sessions').select('*').eq('id', sessionId).maybeSingle()
    message(sessionError, 'Unable to load attendance session.')
    if (!session) throw new Error('Attendance session was not found.')
    await validateFacultySessionWrite(session)
    const enrolled = await client().from('enrollments').select('student_id').eq('section_id', session.section_id).eq('status', 'active')
    message(enrolled.error, 'Unable to validate student enrollment.')
    const activeStudentIds = new Set((enrolled.data ?? []).map((row) => row.student_id))
    const records = await client().from('attendance_records').select('student_id').eq('session_id', session.id)
    message(records.error, 'Unable to validate attendance completion.')
    const recordedIds = new Set((records.data ?? []).map((row) => row.student_id).filter((studentId) => activeStudentIds.has(studentId)))
    if (recordedIds.size < activeStudentIds.size) throw new Error('Set attendance for every active enrolled student before finalizing.')
    const { error } = await client().rpc('finalize_attendance_session', { p_session_id: sessionId })
    message(error, 'Unable to finalize attendance.')
  },

  async requestCorrection(record: AttendanceRecordRow, requestedStatus: AttendanceStatus, reason: string): Promise<void> {
    const user = await currentUser()
    if (record.student_id !== user.id) throw new Error('Students may request corrections only for their own attendance.')
    if (requestedStatus === record.status) throw new Error('Choose a different attendance status.')
    if (reason.trim().length < 3) throw new Error('Enter a correction reason with at least three characters.')
    const { data: session, error: sessionError } = await client().from('attendance_sessions').select('faculty_id').eq('id', record.session_id).maybeSingle()
    message(sessionError, 'Unable to identify the attendance reviewer.')
    if (!session) throw new Error('The attendance session is no longer available.')
    const history: Json = [{ action: 'requested', actor_id: user.id, created_at: new Date().toISOString() }]
    const { error } = await client().from('attendance_corrections').insert({
      attendance_record_id: record.id,
      student_id: record.student_id,
      original_status: record.status,
      requested_status: requestedStatus,
      reason: reason.trim(),
      requester_id: user.id,
      reviewer_id: session.faculty_id,
      history,
    })
    message(error, 'Unable to submit the attendance correction.')
  },

  async reviewCorrection(correctionId: string, approve: boolean, comments?: string): Promise<void> {
    const args = comments?.trim()
      ? { p_correction_id: correctionId, p_approve: approve, p_comments: comments.trim() }
      : { p_correction_id: correctionId, p_approve: approve }
    const { error } = await client().rpc('approve_attendance_correction', args)
    message(error, 'Unable to review the attendance correction.')
  },

  async checkInStaff(): Promise<void> {
    const user = await currentUser()
    const now = new Date()
    const attendanceDate = now.toISOString().slice(0, 10)
    const { error } = await client().from('staff_attendance').insert({
      profile_id: user.id,
      attendance_date: attendanceDate,
      status: 'present',
      check_in_time: now.toISOString(),
    })
    message(error, 'Unable to record staff check-in.')
  },

  async checkOutStaff(recordId: string): Promise<void> {
    const { error } = await client().from('staff_attendance').update({ check_out_time: new Date().toISOString() }).eq('id', recordId)
    message(error, 'Unable to record staff check-out.')
  },

  async updateStaffAttendance(recordId: string, status: AttendanceStatus, notes?: string): Promise<void> {
    const { error } = await client().from('staff_attendance').update({ status, notes: notes?.trim() || null }).eq('id', recordId)
    message(error, 'Unable to update staff attendance.')
  },
}
