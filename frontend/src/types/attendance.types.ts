export type AttendanceStatus = 'checked_in' | 'pending_verification' | 'present' | 'late' | 'absent'
export type CorrectionDecision = 'pending' | 'approved' | 'rejected'
export interface DailyCheckIn { id: string; date: string; studentId: string; status: 'pending_verification' | 'present' | 'late' | 'absent' | 'finalized'; checkedInAt?: string; sectionId?: string; locked?: boolean }
export interface AttendanceSession { id: string; date: string; timetableEntryId: string; facultyId: string; subjectId: string; sectionId: string; locked: boolean }
export interface AttendanceRecord { id: string; sessionId: string; studentId: string; status: Exclude<AttendanceStatus, 'checked_in' | 'pending_verification'>; originalStatus: Exclude<AttendanceStatus, 'checked_in' | 'pending_verification'> }
export interface StaffAttendance { id: string; date: string; userId: string; status: 'present' | 'late' | 'absent' }
export interface AttendanceCorrection { id: string; recordId: string; studentId: string; originalStatus: AttendanceRecord['status']; correctedStatus: AttendanceRecord['status']; reason: string; decision: CorrectionDecision; history: string[] }
