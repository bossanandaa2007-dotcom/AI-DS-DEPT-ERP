import { weekdayOf } from '@/lib/date-time'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/types/database.types'

const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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

export interface AttendanceSheetEntry { studentId: string; status: AttendanceStatus }

export interface AttendanceData {
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
}

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const message = (error: { message: string; code?: string } | null, fallback: string) => {
  if (!error) return
  if (error.code === '23505' || /duplicate|unique/i.test(error.message)) throw new Error('This attendance entry already exists.')
  if (/row-level|policy|permission|authorized/i.test(error.message)) throw new Error('You are not authorized to perform this attendance action.')
  if (/finalized|locked/i.test(error.message)) throw new Error('Finalized attendance is locked. Submit or approve a correction instead.')
  throw new Error(error.message || fallback)
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

export const attendanceRepository = {
  async loadAttendanceData(): Promise<AttendanceData> {
    const [sessions, records, corrections, staffAttendance, profiles, enrollments, timetable, subjects, sections, assignments] = await Promise.all([
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
    ])
    return { sessions, records, corrections, staffAttendance, profiles, enrollments, timetable, subjects, sections, assignments }
  },

  /**
   * Opens, or re-enters, the attendance session for one timetable period on one date.
   * A section has a single period N on any given date, which is exactly what the
   * `(section_id, attendance_date, period, session_type)` unique key encodes, so that key —
   * not `timetable_entry_id` — decides whether a session already exists.
   */
  async openSubjectSession(timetableEntryId: string, attendanceDate: string): Promise<AttendanceSessionRow> {
    const user = await currentUser()
    const { data: entry, error: entryError } = await client().from('timetable_entries').select('*').eq('id', timetableEntryId).maybeSingle()
    message(entryError, 'Unable to load the timetable entry.')
    if (!entry) throw new Error('Timetable entry was not found.')
    if (entry.day_of_week !== weekdayOf(attendanceDate)) throw new Error(`This is a ${dayNames[entry.day_of_week]} period, but ${attendanceDate} is a ${dayNames[weekdayOf(attendanceDate)]}. Change the attendance date to record it.`)
    const { data: assignment, error: assignmentError } = await client().from('faculty_assignments').select('id,subject_id,assignment_type').eq('faculty_id', user.id).eq('section_id', entry.section_id).eq('is_active', true)
    message(assignmentError, 'Unable to verify the Faculty assignment.')
    if (!(assignment ?? []).some((item) => item.subject_id === entry.subject_id || item.assignment_type === 'class_teacher')) throw new Error('This timetable period is outside your active Faculty assignment.')
    const sessionType: Database['public']['Enums']['attendance_session_type'] = entry.lab ? 'lab' : 'subject'
    const existing = await client().from('attendance_sessions').select('*').eq('section_id', entry.section_id).eq('attendance_date', attendanceDate).eq('period', entry.period).eq('session_type', sessionType).maybeSingle()
    message(existing.error, 'Unable to check the attendance session.')
    if (existing.data?.timetable_entry_id === entry.id) return existing.data
    if (existing.data) {
      // Left behind by an earlier build that let a period be opened on another weekday's date.
      // This date can only belong to this period, so re-point the session instead of failing.
      const repaired = await client().from('attendance_sessions').update({ timetable_entry_id: entry.id, subject_id: entry.subject_id }).eq('id', existing.data.id).select().single()
      message(repaired.error, 'An attendance session recorded against a different period already exists for this date.')
      if (repaired.data) return repaired.data
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
    const existing = await client().from('attendance_sessions').select('*').eq('section_id', sectionId).eq('attendance_date', attendanceDate).eq('session_type', 'daily').maybeSingle()
    message(existing.error, 'Unable to check the daily attendance session.')
    if (existing.data) return existing.data
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

  async saveAttendanceRecord(session: AttendanceSessionRow, studentId: string, status: AttendanceStatus): Promise<void> {
    if (session.status === 'finalized' || session.status === 'locked') throw new Error('Finalized attendance is read-only.')
    const enrolled = await client().from('enrollments').select('id').eq('student_id', studentId).eq('section_id', session.section_id).eq('status', 'active').limit(1)
    message(enrolled.error, 'Unable to validate student enrollment.')
    if (!(enrolled.data ?? []).length) throw new Error('The student is not actively enrolled in this section.')
    const existing = await client().from('attendance_records').select('id').eq('session_id', session.id).eq('student_id', studentId).maybeSingle()
    message(existing.error, 'Unable to check the attendance record.')
    if (existing.data) {
      const { error } = await client().from('attendance_records').update({ status }).eq('id', existing.data.id)
      message(error, 'Unable to update attendance.')
    } else {
      const { error } = await client().from('attendance_records').insert({ session_id: session.id, student_id: studentId, status })
      message(error, 'Unable to save attendance.')
    }
  },

  async saveAllAttendance(session: AttendanceSessionRow, students: ProfileRow[], status: AttendanceStatus): Promise<void> {
    await this.submitAttendanceSheet(session, students.map((student) => ({ studentId: student.id, status })))
  },

  /**
   * Writes a whole marked roster in one round trip.  The Faculty attendance sheet keeps every
   * change local until submit, so this is the single point where the sheet reaches the database.
   */
  async submitAttendanceSheet(session: AttendanceSessionRow, entries: AttendanceSheetEntry[]): Promise<void> {
    if (session.status === 'finalized' || session.status === 'locked') throw new Error('Finalized attendance is read-only.')
    if (!entries.length) throw new Error('There are no students to submit attendance for.')
    const user = await currentUser()
    const enrolled = await client().from('enrollments').select('student_id').eq('section_id', session.section_id).eq('status', 'active')
    message(enrolled.error, 'Unable to validate student enrollment.')
    const active = new Set((enrolled.data ?? []).map((row) => row.student_id))
    if (entries.some((entry) => !active.has(entry.studentId))) throw new Error('One or more students are no longer actively enrolled in this section.')
    // Submitting a daily sheet is the Class Teacher verifying the students' own check-ins.
    const verification: Json | undefined = session.session_type === 'daily' ? { verification_state: 'verified', verified_by: user.id, verified_at: new Date().toISOString() } : undefined
    const { error } = await client().from('attendance_records').upsert(
      entries.map((entry) => ({ session_id: session.id, student_id: entry.studentId, status: entry.status, ...(verification ? { verification_data: verification } : {}) })),
      { onConflict: 'session_id,student_id' },
    )
    message(error, 'Unable to submit attendance.')
  },

  async verifyDailyRecord(recordId: string, status: AttendanceStatus): Promise<void> {
    const user = await currentUser()
    const verifiedAt = new Date().toISOString()
    const verification: Json = { verification_state: 'verified', verified_by: user.id, verified_at: verifiedAt }
    const { error } = await client().from('attendance_records').update({ status, verification_data: verification }).eq('id', recordId)
    message(error, 'Unable to verify the daily check-in.')
  },

  async finalizeSession(sessionId: string): Promise<void> {
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

  /** Super Admin only. Seals every session for the section so no Faculty or HOD can edit it again. */
  async lockAttendanceForSection(sectionId: string): Promise<number> {
    const { data, error } = await client().rpc('lock_attendance_for_section', { p_section_id: sectionId })
    message(error, 'Unable to lock this class’s attendance.')
    return data ?? 0
  },

  /** Super Admin only. Reverses a lock placed by mistake; does not restore a Faculty finalize. */
  async unlockAttendanceForSection(sectionId: string): Promise<number> {
    const { data, error } = await client().rpc('unlock_attendance_for_section', { p_section_id: sectionId })
    message(error, 'Unable to unlock this class’s attendance.')
    return data ?? 0
  },
}
