import { supabase } from '@/lib/supabase'
import { ROUTE_PATHS } from '@/app/router/route-paths'
import { readableSupabaseError } from '@/services/supabase/query'
import type { DashboardItem, DashboardMetric, RoleDashboardData } from '@/types'
import type { Database, Json } from '@/types/database.types'

type Tables = Database['public']['Tables']
type Row<Name extends keyof Tables> = Tables[Name]['Row']
type Role = Database['public']['Enums']['app_role']
export type ReportingContext = { id: string; role: Role; departmentId: string | null; sectionId: string | null }
export type ReportKind = 'attendance' | 'marks' | 'requests' | 'complaints' | 'workload' | 'portion' | 'audit' | 'administrative'
export type ReportFilters = { fromDate: string; toDate: string; departmentId: string; academicYearId: string; semesterId: string; yearNumber: string; sectionId: string; subjectId: string; userId: string; status: string }
export type ReportRow = { id: string; reference: string; metric: string; value: string; state: string; detail: string }

export type ReportingData = {
  context: ReportingContext
  profiles: Row<'profiles'>[]
  departments: Row<'departments'>[]
  academicYears: Row<'academic_years'>[]
  semesters: Row<'semesters'>[]
  sections: Row<'sections'>[]
  subjects: Row<'subjects'>[]
  enrollments: Row<'enrollments'>[]
  assignments: Row<'faculty_assignments'>[]
  timetable: Row<'timetable_entries'>[]
  sessions: Row<'attendance_sessions'>[]
  attendance: Row<'attendance_records'>[]
  staffAttendance: Row<'staff_attendance'>[]
  assessments: Row<'assessments'>[]
  marks: Row<'marks'>[]
  attendanceCorrections: Row<'attendance_corrections'>[]
  markCorrections: Row<'mark_corrections'>[]
  requests: Row<'requests'>[]
  portions: Row<'portion_updates'>[]
  complaints: Row<'complaints'>[]
  announcements: Row<'announcements'>[]
  projects: Row<'projects'>[]
  competitions: Row<'competitions'>[]
  attachments: Row<'attachments'>[]
  auditLogs: Row<'audit_logs'>[]
}

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const fail = (error: { message: string; code?: string; status?: number } | null, resource: string, operation: string) => {
  if (!error) return
  throw new Error(readableSupabaseError(error, resource, operation))
}
const percent = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : null
const displayPercent = (part: number, whole: number) => { const value = percent(part, whole); return value === null ? '—' : `${value}%` }
const metric = (label: string, value: string | number, detail: string, tone: DashboardMetric['tone']): DashboardMetric => ({ label, value: String(value), detail, tone })
const item = (title: string, detail: string, value?: string, progress?: number, tone: DashboardItem['tone'] = 'primary'): DashboardItem => ({ title, detail, value, progress, tone })
const isPendingRequest = (status: string) => !['hod_approved', 'hod_rejected', 'finalized', 'rejected', 'faculty_rejected'].includes(status)
const dateOnly = (date: string) => date.slice(0, 10)
const dateInRange = (date: string, filters: ReportFilters) => { const value = dateOnly(date); return (!filters.fromDate || value >= filters.fromDate) && (!filters.toDate || value <= filters.toDate) }
const safeMetadata = (value: Json | null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Recorded action'
  const blocked = new Set(['password', 'token', 'secret', 'authorization', 'access_token', 'refresh_token'])
  const fields = Object.entries(value).filter(([key]) => !blocked.has(key.toLowerCase())).slice(0, 3)
  return fields.length ? fields.map(([key, field]) => `${key}: ${typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean' ? String(field) : '[structured]'}`).join(' · ') : 'Recorded action'
}

async function context(): Promise<ReportingContext> {
  const { data: auth, error: authError } = await client().auth.getUser(); fail(authError, 'session', 'verify')
  if (!auth.user) throw new Error('Please sign in again to continue.')
  const { data, error } = await client().from('profiles').select('id,role,status,department_id,section_id').eq('id', auth.user.id).maybeSingle(); fail(error, 'profile', 'load reporting context')
  if (!data) throw new Error('Your ERP profile is missing.')
  if (data.status !== 'active') throw new Error('Your account is inactive.')
  if (data.role === 'system') throw new Error('System audit actors cannot access the ERP.')
  if (data.role !== 'super_admin' && !data.department_id) throw new Error('Your profile requires a department before reports can be loaded.')
  return { id: data.id, role: data.role, departmentId: data.department_id, sectionId: data.section_id }
}

function optionalRows<Name extends keyof Tables>(result: { data: unknown; error: { message: string; code?: string; status?: number } | null }, resource: string): Row<Name>[] {
  if (!result.error) return (result.data ?? []) as Row<Name>[]
  if (import.meta.env.DEV) console.warn(readableSupabaseError(result.error, resource, 'load optional dashboard data'))
  return []
}

const name = (data: ReportingData, id: string | null | undefined, fallback = 'Restricted profile') => data.profiles.find((profile) => profile.id === id)?.full_name ?? fallback
const subjectName = (data: ReportingData, id: string | null | undefined) => data.subjects.find((subject) => subject.id === id)?.name ?? 'Restricted subject'
const sectionName = (data: ReportingData, id: string | null | undefined) => data.sections.find((section) => section.id === id)?.name ?? 'Restricted section'
const safeReference = (value: string | null | undefined) => value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? 'Recorded item' : value ?? 'Recorded item'
const currentDay = () => { const day = new Date().getDay(); return day === 0 ? 7 : day }
const todayDate = () => new Date().toISOString().slice(0, 10)
const dayForDate = (date: string) => { const day = new Date(`${date}T00:00:00`).getDay(); return day === 0 ? 7 : day }
const activeStudents = (data: ReportingData) => new Set(data.enrollments.filter((entry) => entry.status === 'active').map((entry) => entry.student_id))
const recordAttendance = (records: Row<'attendance_records'>[]) => ({ present: records.filter((record) => record.status === 'present' || record.status === 'late').length, total: records.length })
const activeSectionStudents = (data: ReportingData, sectionId: string) => data.enrollments.filter((entry) => entry.section_id === sectionId && entry.status === 'active').map((entry) => entry.student_id)
const entryInEffect = (entry: Row<'timetable_entries'>, date: string) => entry.effective_from <= date && (!entry.effective_to || entry.effective_to >= date)

function sectionMatches(data: ReportingData, sectionId: string | null | undefined, filters: ReportFilters) {
  const section = sectionId ? data.sections.find((item) => item.id === sectionId) : null
  if (!section) return !filters.academicYearId && !filters.semesterId && !filters.yearNumber && !filters.sectionId
  return (!filters.academicYearId || section.academic_year_id === filters.academicYearId) && (!filters.semesterId || section.semester_id === filters.semesterId) && (!filters.yearNumber || String(section.year_number) === filters.yearNumber) && (!filters.sectionId || section.id === filters.sectionId)
}

function profileSectionId(data: ReportingData, profileId: string | null | undefined) {
  if (!profileId) return null
  return data.enrollments.find((entry) => entry.student_id === profileId && entry.status === 'active')?.section_id ?? data.profiles.find((profile) => profile.id === profileId)?.section_id ?? null
}

function facultyAssignedPeriods(data: ReportingData, userId: string, date = todayDate()) {
  const day = dayForDate(date)
  const seen = new Set<string>()
  return data.timetable
    .filter((entry) => entry.is_active && entry.faculty_id === userId && entry.subject_id && entry.day_of_week === day && entryInEffect(entry, date))
    .filter((entry) => data.assignments.some((assignment) => assignment.faculty_id === userId && assignment.is_active && assignment.section_id === entry.section_id && assignment.subject_id === entry.subject_id))
    .filter((entry) => {
      const key = `${entry.section_id}-${entry.subject_id}-${entry.period}-${date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((first, second) => first.period - second.period || first.starts_at.localeCompare(second.starts_at))
}

function sessionForAssignedPeriod(data: ReportingData, period: Row<'timetable_entries'>, date: string) {
  return data.sessions.find((session) => session.attendance_date === date && (session.timetable_entry_id === period.id || (session.section_id === period.section_id && session.subject_id === period.subject_id && session.period === period.period)))
}

function pendingFacultyAttendancePeriods(data: ReportingData, userId: string) {
  const date = todayDate()
  return facultyAssignedPeriods(data, userId, date).filter((period) => {
    const session = sessionForAssignedPeriod(data, period, date)
    if (session?.status === 'finalized' || session?.status === 'locked') return false
    const students = activeSectionStudents(data, period.section_id)
    if (!students.length) return false
    const submitted = session ? new Set(data.attendance.filter((record) => record.session_id === session.id).map((record) => record.student_id)).size : 0
    return !session || submitted < students.length
  })
}

export const reportingRepository = {
  async load(): Promise<ReportingData> {
    const user = await context()
    const competitionQuery = user.role === 'student'
      ? client().from('competitions').select('*').contains('details', { participant_ids: [user.id] })
      : client().from('competitions').select('*')
    const [profiles, departments, academicYears, semesters, sections, subjects, enrollments, assignments, timetable, sessions, attendance, staffAttendance, assessments, marks, attendanceCorrections, markCorrections, requests, portions, complaints, announcements, projects, competitions, attachments, auditLogs] = await Promise.all([
      client().from('profiles').select('*'), client().from('departments').select('*'), client().from('academic_years').select('*'), client().from('semesters').select('*'), client().from('sections').select('*'), client().from('subjects').select('*'), client().from('enrollments').select('*'), client().from('faculty_assignments').select('*'), client().from('timetable_entries').select('*'), client().from('attendance_sessions').select('*'), client().from('attendance_records').select('*'), client().from('staff_attendance').select('*'), client().from('assessments').select('*'), client().from('marks').select('*'), client().from('attendance_corrections').select('*'), client().from('mark_corrections').select('*'), client().from('requests').select('*'), client().from('portion_updates').select('*'), client().from('complaints').select('*'), client().from('announcements').select('*'), client().from('projects').select('*'), competitionQuery, client().from('attachments').select('*'), client().from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    return { context: user, profiles: optionalRows<'profiles'>(profiles, 'profiles'), departments: optionalRows<'departments'>(departments, 'departments'), academicYears: optionalRows<'academic_years'>(academicYears, 'academic years'), semesters: optionalRows<'semesters'>(semesters, 'semesters'), sections: optionalRows<'sections'>(sections, 'sections'), subjects: optionalRows<'subjects'>(subjects, 'subjects'), enrollments: optionalRows<'enrollments'>(enrollments, 'enrollments'), assignments: optionalRows<'faculty_assignments'>(assignments, 'faculty assignments'), timetable: optionalRows<'timetable_entries'>(timetable, 'timetable'), sessions: optionalRows<'attendance_sessions'>(sessions, 'attendance sessions'), attendance: optionalRows<'attendance_records'>(attendance, 'attendance records'), staffAttendance: optionalRows<'staff_attendance'>(staffAttendance, 'staff attendance'), assessments: optionalRows<'assessments'>(assessments, 'assessments'), marks: optionalRows<'marks'>(marks, 'marks'), attendanceCorrections: optionalRows<'attendance_corrections'>(attendanceCorrections, 'attendance corrections'), markCorrections: optionalRows<'mark_corrections'>(markCorrections, 'mark corrections'), requests: optionalRows<'requests'>(requests, 'requests'), portions: optionalRows<'portion_updates'>(portions, 'portion updates'), complaints: optionalRows<'complaints'>(complaints, 'complaints'), announcements: optionalRows<'announcements'>(announcements, 'announcements'), projects: optionalRows<'projects'>(projects, 'projects'), competitions: optionalRows<'competitions'>(competitions, 'competitions'), attachments: optionalRows<'attachments'>(attachments, 'attachments'), auditLogs: optionalRows<'audit_logs'>(auditLogs, 'audit logs') }
  },

  dashboard(data: ReportingData): RoleDashboardData {
    const { context: user } = data
    if (user.role === 'system') throw new Error('System audit actors cannot access the ERP.')
    const students = activeStudents(data)
    const attendanceSummary = recordAttendance(data.attendance)
    const pendingRequests = data.requests.filter((request) => isPendingRequest(request.status))
    const quickActions = user.role === 'super_admin' ? [{ label: 'Manage users', description: 'Review active department accounts', path: `${ROUTE_PATHS.superAdmin}/users` }, { label: 'View audit activity', description: 'Inspect recorded operational events', path: `${ROUTE_PATHS.superAdmin}/audit` }] : user.role === 'hod' ? [{ label: 'Attendance', description: 'Review department attendance', path: `${ROUTE_PATHS.hod}/attendance` }, { label: 'Reports', description: 'Filter operational reports', path: `${ROUTE_PATHS.hod}/reports` }] : undefined
    if (user.role === 'super_admin') return {
      role: user.role, title: 'Department overview', description: 'Live Supabase metrics across records visible to your administrator role.', quickActions,
      metrics: [metric('Active students', students.size, `${data.profiles.filter((profile) => profile.role === 'student' && profile.status === 'active').length} active profiles`, 'primary'), metric('Active faculty', data.profiles.filter((profile) => profile.role === 'faculty' && profile.status === 'active').length, `${data.departments.length} visible departments`, 'information'), metric('Attendance', displayPercent(attendanceSummary.present, attendanceSummary.total), `${attendanceSummary.total} attendance records`, attendanceSummary.total ? 'success' : 'warning')],
      sections: [{ title: 'Academic and workflow summary', kind: 'status', items: [item('Active academic years', `${data.academicYears.length} visible configured year(s)`, String(data.academicYears.filter((year) => year.is_active).length), undefined, 'success'), item('Assessments', `${data.assessments.filter((assessment) => assessment.status === 'finalized').length} finalized`, String(data.assessments.length), undefined, 'information'), item('Pending requests', 'Leave, gate pass, staff leave, and OD', String(pendingRequests.length), undefined, pendingRequests.length ? 'warning' : 'success'), item('Complaints', `${data.complaints.filter((complaint) => complaint.status !== 'resolved').length} unresolved`, String(data.complaints.length), undefined, 'primary')] }, { title: 'Document reviews', kind: 'status', items: [item('Pending faculty review', 'Private document workflow', String(data.attachments.filter((attachment) => attachment.verification_status === 'pending_faculty_review').length), undefined, 'warning'), item('Pending jury review', 'Private document workflow', String(data.attachments.filter((attachment) => attachment.verification_status === 'pending_jury_review').length), undefined, 'warning')] }, { title: 'Recent audit activity', kind: 'list', items: data.auditLogs.slice(0, 5).map((log) => item(log.action, `${log.module} · ${safeMetadata(log.after_data ?? log.before_data)}`, new Date(log.created_at).toLocaleString(), undefined, 'information')), emptyTitle: 'No accessible audit activity', emptyDescription: 'Recorded events will appear here when available.' }],
    }
    if (user.role === 'hod') {
      const faculty = data.profiles.filter((profile) => profile.role === 'faculty' && profile.status === 'active')
      const pendingSessions = data.sessions.filter((session) => session.status !== 'finalized' && session.status !== 'locked')
      const departmentActivity = data.auditLogs.filter((log) => data.profiles.some((profile) => profile.id === log.actor_id && profile.department_id === user.departmentId))
      return { role: user.role, title: 'Department dashboard', description: 'RLS-scoped attendance, academic progress, and operational workload.', quickActions,
        metrics: [metric('Active students', students.size, 'Active enrollments', 'primary'), metric('Department attendance', displayPercent(attendanceSummary.present, attendanceSummary.total), `${attendanceSummary.total} recorded entries`, attendanceSummary.total ? 'success' : 'warning'), metric('Pending requests', pendingRequests.length, 'Requests awaiting workflow action', pendingRequests.length ? 'warning' : 'success')],
        sections: [{ title: 'Academic controls', kind: 'status', items: [item('Faculty', 'Active visible Faculty profiles', String(faculty.length), undefined, 'information'), item('Attendance verification', 'Draft or open sessions', String(pendingSessions.length), undefined, pendingSessions.length ? 'warning' : 'success'), item('Marks finalization', 'Assessments finalized', `${data.assessments.filter((assessment) => assessment.status === 'finalized').length}/${data.assessments.length}`, undefined, 'primary'), item('Complaints', 'Unresolved visible complaints', String(data.complaints.filter((complaint) => complaint.status !== 'resolved').length), undefined, 'warning')] }, { title: 'Faculty workload', kind: 'list', items: faculty.map((profile) => item(profile.full_name, `${data.timetable.filter((entry) => entry.faculty_id === profile.id).length} timetable entry(s) · ${data.assignments.filter((assignment) => assignment.faculty_id === profile.id && assignment.is_active).length} active assignment(s)`, undefined, undefined, 'information')), emptyTitle: 'No faculty workload records', emptyDescription: 'Visible active faculty assignments will appear here.' }, { title: 'Portion completion', kind: 'progress', items: data.portions.slice(0, 6).map((portion) => item(`${subjectName(data, portion.subject_id)} · ${sectionName(data, portion.section_id)}`, `Updated ${new Date(portion.updated_at).toLocaleDateString()}`, `${Number(portion.completion_percentage)}%`, Number(portion.completion_percentage), Number(portion.completion_percentage) >= 75 ? 'success' : 'warning')), emptyTitle: 'No portion updates', emptyDescription: 'Faculty updates will appear here.' }, { title: 'Recent department activity', kind: 'list', items: departmentActivity.slice(0, 5).map((log) => item(log.action, `${log.module} · ${safeMetadata(log.after_data ?? log.before_data)}`, new Date(log.created_at).toLocaleString(), undefined, 'information')), emptyTitle: 'No department activity', emptyDescription: 'Department-identifiable audit events will appear here.' }] }
    }
    if (user.role === 'faculty') {
      const ownAssignments = data.assignments.filter((assignment) => assignment.faculty_id === user.id && assignment.is_active && assignment.subject_id)
      const pendingAttendance = pendingFacultyAttendancePeriods(data, user.id)
      const ownAssessments = data.assessments.filter((assessment) => assessment.faculty_id === user.id)
      const draftAssessments = ownAssessments.filter((assessment) => assessment.status === 'draft')
      const completedAssessments = ownAssessments.filter((assessment) => assessment.status === 'completed')
      const pendingAttendanceCorrections = data.attendanceCorrections.filter((correction) => {
        if (correction.status !== 'pending') return false
        const record = data.attendance.find((row) => row.id === correction.attendance_record_id)
        const session = data.sessions.find((row) => row.id === record?.session_id)
        return session?.faculty_id === user.id && session.status !== 'locked'
      })
      const pendingMarkCorrections = data.markCorrections.filter((correction) => {
        if (correction.status !== 'pending') return false
        const mark = data.marks.find((row) => row.id === correction.mark_id)
        const assessment = data.assessments.find((row) => row.id === mark?.assessment_id)
        return assessment?.faculty_id === user.id
      })
      const ownReviews = data.attachments.filter((attachment) => attachment.faculty_reviewer_id === user.id || attachment.jury_reviewer_id === user.id).filter((attachment) => ['pending_faculty_review', 'pending_jury_review'].includes(attachment.verification_status))
      const firstPending = pendingAttendance[0]
      const facultyQuickActions = firstPending ? [{ label: 'Mark attendance', description: `${subjectName(data, firstPending.subject_id)} - ${sectionName(data, firstPending.section_id)} - Period ${firstPending.period}`, path: `${ROUTE_PATHS.faculty}/attendance?date=${todayDate()}&periodId=${firstPending.id}` }] : undefined
      const ownSessions = data.sessions.filter((session) => session.faculty_id === user.id)
      if (pendingAttendance.length >= 0) return { role: user.role, title: 'Faculty workspace', description: 'Only assignments and workflows available to your authenticated profile.', quickActions: facultyQuickActions, metrics: [metric('Assigned subjects', new Set(ownAssignments.map((assignment) => assignment.subject_id)).size, `${new Set(ownAssignments.map((assignment) => assignment.section_id)).size} assigned section(s)`, 'primary'), metric('Pending attendance', pendingAttendance.length, 'Today assigned periods missing complete attendance records', pendingAttendance.length ? 'warning' : 'success'), metric('Review tasks', ownReviews.length, 'Assigned private document reviews', ownReviews.length ? 'warning' : 'success')], sections: [{ title: 'Today\'s timetable', kind: 'schedule', items: facultyAssignedPeriods(data, user.id).map((entry) => item(subjectName(data, entry.subject_id), `${sectionName(data, entry.section_id)} - ${entry.room}`, `${entry.starts_at} - ${entry.ends_at}`, undefined, pendingAttendance.some((pending) => pending.id === entry.id) ? 'warning' : 'primary')), emptyTitle: 'No timetable entries today', emptyDescription: 'Your authorized timetable entries appear here.' }, { title: 'Assessment and correction tasks', kind: 'status', items: [item('Draft assessments', 'Marks entry remains editable', String(draftAssessments.length), undefined, draftAssessments.length ? 'warning' : 'success'), item('Completed assessments', 'Ready to finalize where workflow permits', String(completedAssessments.length), undefined, completedAssessments.length ? 'information' : 'success'), item('Pending attendance corrections', 'Authorized correction review', String(pendingAttendanceCorrections.length), undefined, pendingAttendanceCorrections.length ? 'warning' : 'success'), item('Pending marks corrections', 'Authorized correction review', String(pendingMarkCorrections.length), undefined, pendingMarkCorrections.length ? 'warning' : 'success'), item('Student requests', 'Requests visible under workflow RLS', String(pendingRequests.length), undefined, 'information')] }, { title: 'Portion completion', kind: 'progress', items: data.portions.filter((portion) => portion.faculty_id === user.id).slice(0, 6).map((portion) => item(subjectName(data, portion.subject_id), sectionName(data, portion.section_id), `${Number(portion.completion_percentage)}%`, Number(portion.completion_percentage), Number(portion.completion_percentage) >= 75 ? 'success' : 'warning')), emptyTitle: 'No portion updates', emptyDescription: 'Submit progress from Portion Completion.' }] }
      return { role: user.role, title: 'Faculty workspace', description: 'Only assignments and workflows available to your authenticated profile.', metrics: [metric('Assigned subjects', new Set(ownAssignments.map((assignment) => assignment.subject_id)).size, `${new Set(ownAssignments.map((assignment) => assignment.section_id)).size} assigned section(s)`, 'primary'), metric('Pending attendance', ownSessions.filter((session) => !['finalized', 'locked'].includes(session.status)).length, 'Draft or open sessions', 'warning'), metric('Review tasks', ownReviews.length, 'Assigned private document reviews', ownReviews.length ? 'warning' : 'success')], sections: [{ title: 'Today’s timetable', kind: 'schedule', items: data.timetable.filter((entry) => entry.faculty_id === user.id && entry.day_of_week === currentDay()).map((entry) => item(subjectName(data, entry.subject_id), `${sectionName(data, entry.section_id)} · ${entry.room}`, `${entry.starts_at} – ${entry.ends_at}`, undefined, 'primary')), emptyTitle: 'No timetable entries today', emptyDescription: 'Your authorized timetable entries appear here.' }, { title: 'Assessment and correction tasks', kind: 'status', items: [item('Draft assessments', 'Marks entry remains editable', String(ownAssessments.filter((assessment) => assessment.status === 'draft').length), undefined, 'warning'), item('Pending attendance corrections', 'Authorized correction review', String(data.attendanceCorrections.filter((correction) => correction.status === 'pending').length), undefined, 'warning'), item('Pending marks corrections', 'Authorized correction review', String(data.markCorrections.filter((correction) => correction.status === 'pending').length), undefined, 'warning'), item('Student requests', 'Requests visible under workflow RLS', String(pendingRequests.length), undefined, 'information')] }, { title: 'Portion completion', kind: 'progress', items: data.portions.filter((portion) => portion.faculty_id === user.id).slice(0, 6).map((portion) => item(subjectName(data, portion.subject_id), sectionName(data, portion.section_id), `${Number(portion.completion_percentage)}%`, Number(portion.completion_percentage), Number(portion.completion_percentage) >= 75 ? 'success' : 'warning')), emptyTitle: 'No portion updates', emptyDescription: 'Submit progress from Portion Completion.' }] }
    }
    if (user.role === 'lab_assistant') {
      const personalStaff = data.staffAttendance.filter((record) => record.profile_id === user.id)
      const staffSummary = recordAttendance(personalStaff.map((record) => ({ status: record.status }) as Row<'attendance_records'>))
      return { role: user.role, title: 'Lab operations', description: 'RLS-visible lab timetable, staff attendance, and permitted workflow records.', metrics: [metric('Personal attendance', displayPercent(staffSummary.present, staffSummary.total), `${staffSummary.total} staff attendance record(s)`, staffSummary.total ? 'success' : 'warning'), metric('Lab sessions today', data.timetable.filter((entry) => entry.lab_assistant_id === user.id && entry.day_of_week === currentDay()).length, 'Assigned timetable entries', 'primary'), metric('Permitted requests', pendingRequests.length, 'Visible requests awaiting action', pendingRequests.length ? 'warning' : 'success')], sections: [{ title: 'Today’s lab timetable', kind: 'schedule', items: data.timetable.filter((entry) => entry.lab_assistant_id === user.id && entry.day_of_week === currentDay()).map((entry) => item(subjectName(data, entry.subject_id), `${sectionName(data, entry.section_id)} · ${entry.lab ?? entry.room}`, `${entry.starts_at} – ${entry.ends_at}`, undefined, 'primary')), emptyTitle: 'No assigned lab sessions today', emptyDescription: 'Only permitted timetable records are shown.' }, { title: 'Staff attendance', kind: 'list', items: personalStaff.slice(0, 5).map((record) => item(record.attendance_date, record.check_in_time ? `Checked in ${new Date(record.check_in_time).toLocaleTimeString()}` : 'No check-in time', record.status, undefined, record.status === 'present' ? 'success' : 'warning')), emptyTitle: 'No staff attendance records', emptyDescription: 'Personal staff attendance will appear here.' }, { title: 'Department announcements', kind: 'list', items: data.announcements.slice(0, 5).map((announcement) => item(announcement.title, announcement.category, announcement.publish_date, undefined, 'information')), emptyTitle: 'No announcements', emptyDescription: 'Announcements available to your role will appear here.' }] }
    }
    const personalAttendance = data.attendance.filter((record) => record.student_id === user.id)
    const personalMarks = data.marks.filter((mark) => mark.student_id === user.id && !mark.absent && mark.obtained_marks !== null)
    const personalMarkAverage = personalMarks.length ? Math.round(personalMarks.reduce((sum, mark) => sum + Number(mark.obtained_marks), 0) / personalMarks.length) : null
    const ownRequests = data.requests.filter((request) => request.requester_id === user.id)
    return { role: user.role, title: 'Student dashboard', description: 'Your personal records available through authenticated Supabase access.', metrics: [metric('Attendance', displayPercent(recordAttendance(personalAttendance).present, personalAttendance.length), `${personalAttendance.length} attendance record(s)`, personalAttendance.length ? 'success' : 'warning'), metric('Marks average', personalMarkAverage === null ? '—' : personalMarkAverage, `${personalMarks.length} recorded mark(s)`, personalMarkAverage === null ? 'warning' : 'information'), metric('Pending requests', ownRequests.filter((request) => isPendingRequest(request.status)).length, `${ownRequests.length} personal request(s)`, 'warning')], sections: [{ title: 'Subject-wise attendance', kind: 'progress', items: Object.entries(groupBySubject(data, personalAttendance)).map(([subjectId, records]) => { const summary = recordAttendance(records); const progress = percent(summary.present, summary.total); return item(subjectName(data, subjectId), `${summary.present} present/late of ${summary.total}`, progress === null ? '—' : `${progress}%`, progress ?? 0, progress !== null && progress >= 75 ? 'success' : 'warning') }), emptyTitle: 'No personal attendance records', emptyDescription: 'Attendance will appear once sessions are recorded.' }, { title: 'Marks summary', kind: 'status', items: personalMarks.slice(0, 6).map((mark) => { const assessment = data.assessments.find((row) => row.id === mark.assessment_id); return item(assessment?.title ?? 'Assessment', subjectName(data, assessment?.subject_id), `${mark.obtained_marks ?? '—'} / ${assessment?.maximum_marks ?? '—'}`, undefined, 'information') }), emptyTitle: 'No marks recorded', emptyDescription: 'Published marks will appear here.' }, { title: 'Today’s timetable', kind: 'schedule', items: data.timetable.filter((entry) => entry.section_id === (data.enrollments.find((enrollment) => enrollment.student_id === user.id && enrollment.status === 'active')?.section_id ?? user.sectionId) && entry.day_of_week === currentDay()).map((entry) => item(subjectName(data, entry.subject_id), entry.room, `${entry.starts_at} – ${entry.ends_at}`, undefined, 'primary')), emptyTitle: 'No timetable entries today', emptyDescription: 'Your active-section timetable will appear here.' }, { title: 'Personal operations', kind: 'list', items: [...data.announcements.slice(0, 2).map((announcement) => item(announcement.title, 'Announcement · ' + announcement.category, announcement.publish_date, undefined, 'information')), ...ownRequests.slice(0, 2).map((request) => item(request.request_type.replaceAll('_', ' '), request.reason, request.status, undefined, isPendingRequest(request.status) ? 'warning' : 'success')), ...data.complaints.filter((complaint) => complaint.student_id === user.id).slice(0, 2).map((complaint) => item(complaint.subject, complaint.category, complaint.status, undefined, complaint.status === 'resolved' ? 'success' : 'warning')), ...data.projects.slice(0, 2).map((project) => item(project.name, 'Project', project.status, undefined, 'primary')), ...data.competitions.slice(0, 2).map((competition) => item(competition.name, 'Competition · ' + competition.organizer, competition.event_date, undefined, 'information')), ...data.attachments.filter((attachment) => attachment.owner_id === user.id).slice(0, 2).map((attachment) => item(attachment.filename, 'Document verification', attachment.verification_status, undefined, 'information'))], emptyTitle: 'No personal workflow records', emptyDescription: 'Announcements, requests, projects, and documents will appear here.' }] }
  },

  rows(data: ReportingData, kind: ReportKind, filters: ReportFilters): ReportRow[] {
    data = filters.departmentId || (data.context.role === 'hod' && data.context.departmentId) ? scopedDepartment(data, filters.departmentId || data.context.departmentId!) : data
    const filterCommon = (sectionId: string | null, subjectId: string | null, userId: string | null, status: string, date: string) => dateInRange(date, filters) && sectionMatches(data, sectionId, filters) && (!filters.subjectId || subjectId === filters.subjectId) && (!filters.userId || userId === filters.userId) && (!filters.status || status === filters.status)
    if (kind === 'attendance') return data.sessions.filter((session) => filterCommon(session.section_id, session.subject_id, null, session.status, session.attendance_date) && (!filters.userId || session.faculty_id === filters.userId || data.attendance.some((record) => record.session_id === session.id && record.student_id === filters.userId))).map((session) => { const records = data.attendance.filter((record) => record.session_id === session.id); const summary = recordAttendance(records); return { id: session.id, reference: `${session.attendance_date} · ${subjectName(data, session.subject_id)}`, metric: `${sectionName(data, session.section_id)} · ${name(data, session.faculty_id)}`, value: displayPercent(summary.present, summary.total), state: session.status, detail: `${summary.present}/${summary.total} present or late` } })
    if (kind === 'marks') return data.assessments.filter((assessment) => filterCommon(assessment.section_id, assessment.subject_id, null, assessment.status, assessment.assessment_date) && (!filters.userId || assessment.faculty_id === filters.userId || data.marks.some((mark) => mark.assessment_id === assessment.id && mark.student_id === filters.userId))).map((assessment) => { const values = data.marks.filter((mark) => mark.assessment_id === assessment.id && !mark.absent && mark.obtained_marks !== null).map((mark) => Number(mark.obtained_marks)); const average = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null; return { id: assessment.id, reference: assessment.title, metric: `${subjectName(data, assessment.subject_id)} · ${sectionName(data, assessment.section_id)}`, value: average === null ? '—' : `${average}/${assessment.maximum_marks}`, state: assessment.status, detail: values.length ? `High ${Math.max(...values)} · Low ${Math.min(...values)} · Pass ${values.filter((value) => value >= Number(assessment.maximum_marks) * 0.5).length}/${values.length}` : 'No recorded marks' } })
    if (kind === 'requests') return data.requests.filter((request) => filterCommon(profileSectionId(data, request.requester_id), null, request.requester_id, request.status, request.created_at)).map((request) => ({ id: request.id, reference: request.request_type.replaceAll('_', ' '), metric: name(data, request.requester_id), value: request.status.replaceAll('_', ' '), state: request.status, detail: `${request.from_date ?? request.created_at.slice(0, 10)}${request.to_date ? ` → ${request.to_date}` : ''} · ${request.reason}` }))
    if (kind === 'complaints') return data.complaints.filter((complaint) => filterCommon(profileSectionId(data, complaint.student_id), null, complaint.student_id, complaint.status, complaint.created_at)).map((complaint) => ({ id: complaint.id, reference: complaint.subject, metric: `${complaint.category} · ${name(data, complaint.student_id)}`, value: complaint.status.replaceAll('_', ' '), state: complaint.status, detail: complaint.response ?? new Date(complaint.created_at).toLocaleDateString() }))
    if (kind === 'workload') return data.profiles.filter((profile) => profile.role === 'faculty' && profile.status === 'active' && (!filters.userId || profile.id === filters.userId)).map((profile) => { const assignments = data.assignments.filter((assignment) => assignment.faculty_id === profile.id && assignment.is_active && sectionMatches(data, assignment.section_id, filters)); const periods = data.timetable.filter((entry) => entry.faculty_id === profile.id && sectionMatches(data, entry.section_id, filters)).length; const guideProjects = data.projects.filter((project) => project.faculty_guide_id === profile.id).length; const reviews = data.attachments.filter((attachment) => attachment.faculty_reviewer_id === profile.id || attachment.jury_reviewer_id === profile.id).length; return { id: profile.id, reference: profile.full_name, metric: `${assignments.length} assignment(s) · ${periods} timetable entry(s)`, value: `${guideProjects} projects · ${reviews} reviews`, state: profile.status, detail: assignments.filter((assignment) => assignment.assignment_type === 'class_teacher').length ? 'Class teacher assigned' : 'No class teacher assignment' } })
    if (kind === 'portion') return data.portions.filter((portion) => filterCommon(portion.section_id, portion.subject_id, portion.faculty_id, Number(portion.completion_percentage) >= 100 ? 'complete' : 'pending', portion.updated_at)).map((portion) => ({ id: portion.id, reference: `${subjectName(data, portion.subject_id)} · ${sectionName(data, portion.section_id)}`, metric: `${name(data, portion.faculty_id)} · ${portion.unit}`, value: `${Number(portion.completion_percentage)}%`, state: Number(portion.completion_percentage) >= 100 ? 'complete' : 'pending', detail: `${portion.completed_topic} · Updated ${new Date(portion.updated_at).toLocaleDateString()}` }))
    if (kind === 'audit') return data.auditLogs.filter((log) => filterCommon(profileSectionId(data, log.actor_id), null, log.actor_id, log.action, log.created_at)).map((log) => ({ id: log.id, reference: name(data, log.actor_id, 'System'), metric: `${log.action} · ${log.module}`, value: safeReference(log.record_reference), state: log.actor_role ?? 'system', detail: `${new Date(log.created_at).toLocaleString()} · ${safeMetadata(log.after_data ?? log.before_data)}` }))
    const modules = new Map<string, number>()
    data.auditLogs.filter((log) => dateInRange(log.created_at, filters)).forEach((log) => modules.set(log.module, (modules.get(log.module) ?? 0) + 1))
    return [...modules].map(([module, count]) => ({ id: module, reference: module, metric: 'Recorded administrative activity', value: String(count), state: 'recorded', detail: 'Derived from accessible audit logs' }))
  },
}

function groupBySubject(data: ReportingData, records: Row<'attendance_records'>[]) {
  return records.reduce<Record<string, Row<'attendance_records'>[]>>((groups, record) => {
    const session = data.sessions.find((item) => item.id === record.session_id)
    const key = session?.subject_id ?? 'daily'
    groups[key] = [...(groups[key] ?? []), record]
    return groups
  }, {})
}

function scopedDepartment(data: ReportingData, departmentId: string): ReportingData {
  const sections = data.sections.filter((section) => section.department_id === departmentId)
  const sectionIds = new Set(sections.map((section) => section.id))
  const profiles = data.profiles.filter((profile) => profile.department_id === departmentId)
  const profileIds = new Set(profiles.map((profile) => profile.id))
  const subjects = data.subjects.filter((subject) => subject.department_id === departmentId)
  const assessments = data.assessments.filter((assessment) => sectionIds.has(assessment.section_id))
  const assessmentIds = new Set(assessments.map((assessment) => assessment.id))
  const sessions = data.sessions.filter((session) => sectionIds.has(session.section_id))
  const sessionIds = new Set(sessions.map((session) => session.id))
  return { ...data, profiles, departments: data.departments.filter((department) => department.id === departmentId), academicYears: data.academicYears.filter((year) => year.department_id === departmentId), semesters: data.semesters.filter((semester) => data.academicYears.some((year) => year.id === semester.academic_year_id && year.department_id === departmentId)), sections, subjects, enrollments: data.enrollments.filter((enrollment) => sectionIds.has(enrollment.section_id)), assignments: data.assignments.filter((assignment) => sectionIds.has(assignment.section_id)), timetable: data.timetable.filter((entry) => sectionIds.has(entry.section_id)), sessions, attendance: data.attendance.filter((record) => sessionIds.has(record.session_id)), staffAttendance: data.staffAttendance.filter((record) => profileIds.has(record.profile_id)), assessments, marks: data.marks.filter((mark) => assessmentIds.has(mark.assessment_id)), attendanceCorrections: data.attendanceCorrections.filter((correction) => profileIds.has(correction.student_id)), markCorrections: data.markCorrections.filter((correction) => profileIds.has(correction.student_id)), requests: data.requests.filter((request) => profileIds.has(request.requester_id)), portions: data.portions.filter((portion) => sectionIds.has(portion.section_id)), complaints: data.complaints.filter((complaint) => complaint.department_id === departmentId), announcements: data.announcements.filter((announcement) => announcement.department_id === departmentId), projects: data.projects.filter((project) => project.department_id === departmentId), competitions: data.competitions.filter((competition) => competition.department_id === departmentId), attachments: data.attachments.filter((attachment) => profileIds.has(attachment.owner_id)), auditLogs: data.auditLogs.filter((log) => log.actor_id !== null && profileIds.has(log.actor_id)) }
}
