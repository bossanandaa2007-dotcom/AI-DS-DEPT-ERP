import { useCallback, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'

import { DataTable } from '@/components/common/DataTable'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { USER_ROLES } from '@/constants/roles'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { reportingRepository, type ReportingData } from '@/services/supabase/reportingRepository'
import type { Json } from '@/types/database.types'

type ReportKind = 'attendance' | 'marks' | 'leave' | 'gate_pass' | 'od' | 'complaints' | 'workload' | 'audit' | 'administrative'
type ReportFilters = { academicYearId: string; semesterId: string; studyYear: string; sectionId: string; fromDate: string; toDate: string; status: string; search: string }
type ReportRow = { id: string; primary: string; secondary: string; metric: string; value: string; status: string; detail: string; date: string }

const reportTabs: Array<{ kind: ReportKind; label: string }> = [
  { kind: 'attendance', label: 'Attendance' },
  { kind: 'marks', label: 'Marks' },
  { kind: 'leave', label: 'Leave' },
  { kind: 'gate_pass', label: 'Gate Pass' },
  { kind: 'od', label: 'OD' },
  { kind: 'complaints', label: 'Complaints' },
  { kind: 'workload', label: 'Faculty workload' },
  { kind: 'audit', label: 'Audit' },
  { kind: 'administrative', label: 'Administrative summary' },
]
const emptyFilters: ReportFilters = { academicYearId: '', semesterId: '', studyYear: '', sectionId: '', fromDate: '', toDate: '', status: '', search: '' }
const finalizedStatuses = new Set(['finalized', 'locked'])
const pendingRequestStatuses = new Set(['draft', 'submitted', 'class_teacher_approved', 'faculty_approved', 'provisional_approved', 'certificate_pending', 'certificate_verified'])
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const sensitiveKeys = ['auth', 'authorization', 'email', 'password', 'path', 'secret', 'storage', 'token']

const percent = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : null
const displayPercent = (part: number, whole: number) => { const value = percent(part, whole); return value === null ? '—' : `${value}%` }
const display = (value: string) => value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const roleLabel = (value: string) => value === USER_ROLES.superAdmin ? 'Admin' : display(value)
const tone = (state: string): 'primary' | 'success' | 'warning' | 'muted' => /active|approved|complete|finalized|locked|ok|present|recorded|resolved|verified/i.test(state) ? 'success' : /absent|cancelled|draft|inactive|pending|rejected|shortage|unallocated|warning/i.test(state) ? 'warning' : 'primary'
const safe = (value: string | null | undefined) => {
  const text = String(value ?? '—').trim()
  if (!text || uuidPattern.test(text) || emailPattern.test(text) || /password|token|secret|storage\//i.test(text)) return '—'
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}
const safeMetadata = (value: Json | null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Recorded action'
  return Object.entries(value).filter(([key]) => !sensitiveKeys.some((blocked) => key.toLowerCase().includes(blocked))).slice(0, 3).map(([key, item]) => `${display(key)}: ${typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ? safe(String(item)) : '[protected]'}`).join(' · ') || 'Recorded action'
}

function helpers(data: ReportingData) {
  const profiles = new Map(data.profiles.map((profile) => [profile.id, profile]))
  const sections = new Map(data.sections.map((section) => [section.id, section]))
  const subjects = new Map(data.subjects.map((subject) => [subject.id, subject]))
  const semesters = new Map(data.semesters.map((semester) => [semester.id, semester]))
  const years = new Map(data.academicYears.map((year) => [year.id, year]))
  const profile = (id: string | null | undefined) => id ? profiles.get(id) : undefined
  const section = (id: string | null | undefined) => id ? sections.get(id) : undefined
  const subject = (id: string | null | undefined) => id ? subjects.get(id) : undefined
  const semester = (id: string | null | undefined) => id ? semesters.get(id) : undefined
  const year = (id: string | null | undefined) => id ? years.get(id) : undefined
  const person = (id: string | null | undefined) => {
    const item = profile(id)
    return { name: item?.full_name ?? 'System', identifier: item?.employee_or_register_number ?? '—', role: roleLabel(item?.role ?? 'system') }
  }
  return { person, profile, section, semester, subject, year }
}

function dateMatches(date: string, filters: ReportFilters) {
  return (!filters.fromDate || date >= filters.fromDate) && (!filters.toDate || date <= filters.toDate)
}

function sectionMatches(data: ReportingData, sectionId: string | null | undefined, filters: ReportFilters) {
  const section = sectionId ? data.sections.find((item) => item.id === sectionId) : null
  if (!section) return !filters.academicYearId && !filters.semesterId && !filters.studyYear && !filters.sectionId
  return (!filters.academicYearId || section.academic_year_id === filters.academicYearId)
    && (!filters.semesterId || section.semester_id === filters.semesterId)
    && (!filters.studyYear || String(section.year_number) === filters.studyYear)
    && (!filters.sectionId || section.id === filters.sectionId)
}

function requesterMatches(data: ReportingData, requesterId: string, filters: ReportFilters) {
  const profile = data.profiles.find((item) => item.id === requesterId)
  const enrollment = data.enrollments.find((item) => item.student_id === requesterId && item.status === 'active')
  return sectionMatches(data, enrollment?.section_id ?? profile?.section_id ?? null, filters)
}

function buildAttendanceRows(data: ReportingData, filters: ReportFilters): ReportRow[] {
  const h = helpers(data)
  const sessions = data.sessions.filter((session) => finalizedStatuses.has(session.status) && dateMatches(session.attendance_date, filters) && sectionMatches(data, session.section_id, filters))
  const activeEnrollments = data.enrollments.filter((enrollment) => enrollment.status === 'active' && sectionMatches(data, enrollment.section_id, filters))
  return activeEnrollments.map((enrollment) => {
    const student = h.person(enrollment.student_id)
    const section = h.section(enrollment.section_id)
    const eligibleSessions = sessions.filter((session) => session.section_id === enrollment.section_id)
    const records = data.attendance.filter((record) => record.student_id === enrollment.student_id && eligibleSessions.some((session) => session.id === record.session_id))
    const present = records.filter((record) => record.status === 'present' || record.status === 'late').length
    const late = records.filter((record) => record.status === 'late').length
    const absent = records.filter((record) => record.status === 'absent').length
    const percentage = percent(present, eligibleSessions.length)
    return { id: `attendance-${enrollment.id}`, primary: student.name, secondary: `Register Number: ${student.identifier}`, metric: `${section?.name ?? 'Section'} · Year ${section?.year_number ?? '—'}`, value: percentage === null ? '—' : `${percentage}%`, status: percentage === null ? 'no_sessions' : percentage < 75 ? 'shortage' : 'ok', detail: `Present ${present} · Late ${late} · Absent ${absent} · Finalized sessions ${eligibleSessions.length}`, date: h.year(enrollment.academic_year_id)?.name ?? '—' }
  })
}

function buildMarksRows(data: ReportingData, filters: ReportFilters): ReportRow[] {
  const h = helpers(data)
  const assessments = data.assessments.filter((assessment) => dateMatches(assessment.assessment_date, filters) && sectionMatches(data, assessment.section_id, filters))
  return assessments.flatMap((assessment) => data.marks.filter((mark) => mark.assessment_id === assessment.id).map((mark) => {
    const subject = h.subject(assessment.subject_id)
    const section = h.section(assessment.section_id)
    const student = h.person(mark.student_id)
    const faculty = h.person(assessment.faculty_id)
    const score = mark.absent || mark.obtained_marks === null ? null : Number(mark.obtained_marks)
    const percentage = score === null ? null : percent(score, Number(assessment.maximum_marks))
    return { id: `marks-${mark.id}`, primary: student.name, secondary: `Register Number: ${student.identifier}`, metric: `${assessment.title} · ${subject?.code ?? 'Subject'} · ${subject?.name ?? '—'}`, value: score === null ? 'Absent' : `${score}/${assessment.maximum_marks} (${percentage}%)`, status: assessment.status, detail: `${section?.name ?? 'Section'} · Year ${section?.year_number ?? '—'} · Faculty ${faculty.name} (${faculty.identifier}) · Result ${score === null ? 'Absent' : score >= Number(assessment.maximum_marks) * 0.5 ? 'Pass' : 'Needs improvement'}`, date: assessment.assessment_date }
  }))
}

function buildRequestRows(data: ReportingData, filters: ReportFilters, kind: 'leave' | 'gate_pass' | 'od'): ReportRow[] {
  const h = helpers(data)
  const allowed = kind === 'leave' ? new Set(['student_leave', 'staff_leave']) : new Set([kind])
  return data.requests.filter((request) => allowed.has(request.request_type) && dateMatches((request.from_date ?? request.created_at).slice(0, 10), filters) && requesterMatches(data, request.requester_id, filters)).map((request) => {
    const requester = h.person(request.requester_id)
    return { id: `request-${request.id}`, primary: requester.name, secondary: `${requester.role}: ${requester.identifier}`, metric: display(request.request_type), value: `${request.from_date ?? request.created_at.slice(0, 10)}${request.to_date ? ` → ${request.to_date}` : ''}`, status: request.status, detail: safe(request.reason), date: (request.from_date ?? request.created_at).slice(0, 10) }
  })
}

function buildComplaintRows(data: ReportingData, filters: ReportFilters): ReportRow[] {
  const h = helpers(data)
  return data.complaints.filter((complaint) => dateMatches(complaint.created_at.slice(0, 10), filters) && requesterMatches(data, complaint.student_id, filters)).map((complaint) => {
    const student = h.person(complaint.student_id)
    return { id: `complaint-${complaint.id}`, primary: safe(complaint.subject), secondary: `${student.name} · ${student.identifier}`, metric: safe(complaint.category), value: safe(complaint.response) === '—' ? 'Awaiting response' : 'Response recorded', status: complaint.status, detail: safe(complaint.description), date: complaint.created_at.slice(0, 10) }
  })
}

function buildWorkloadRows(data: ReportingData, filters: ReportFilters): ReportRow[] {
  return data.profiles.filter((profile) => profile.role === 'faculty' && (!filters.status || profile.status === filters.status)).map((profile) => {
    const activeAssignments = data.assignments.filter((assignment) => assignment.faculty_id === profile.id && assignment.is_active && sectionMatches(data, assignment.section_id, filters))
    const hours = activeAssignments.reduce((sum, assignment) => sum + Number(assignment.weekly_hours), 0)
    const subjects = new Set(activeAssignments.map((assignment) => assignment.subject_id).filter(Boolean))
    return { id: `workload-${profile.id}`, primary: profile.full_name, secondary: `Faculty ID: ${profile.employee_or_register_number ?? '—'}`, metric: `${subjects.size} subject(s) · ${activeAssignments.length} active allocation(s)`, value: `${hours} weekly hour(s)`, status: hours > 20 ? 'warning' : profile.status, detail: activeAssignments.length ? 'Active subject allocation workload from faculty assignments' : 'No active filtered allocation', date: profile.updated_at.slice(0, 10) }
  })
}

function buildAuditRows(data: ReportingData, filters: ReportFilters): ReportRow[] {
  const h = helpers(data)
  return data.auditLogs.filter((log) => dateMatches(log.created_at.slice(0, 10), filters)).map((log) => {
    const actor = h.person(log.actor_id)
    return { id: `audit-${log.id}`, primary: actor.name, secondary: `${actor.role}: ${actor.identifier}`, metric: display(log.action), value: display(log.module), status: 'recorded', detail: safeMetadata(log.after_data ?? log.before_data), date: log.created_at.slice(0, 10) }
  })
}

function buildAdministrativeRows(data: ReportingData, filters: ReportFilters): ReportRow[] {
  const attendanceRows = buildAttendanceRows(data, filters)
  const finalized = data.sessions.filter((session) => finalizedStatuses.has(session.status) && dateMatches(session.attendance_date, filters) && sectionMatches(data, session.section_id, filters))
  const present = finalized.reduce((sum, session) => sum + data.attendance.filter((record) => record.session_id === session.id && (record.status === 'present' || record.status === 'late')).length, 0)
  const total = finalized.reduce((sum, session) => sum + data.attendance.filter((record) => record.session_id === session.id).length, 0)
  const rows: ReportRow[] = [
    { id: 'admin-students', primary: 'Students', secondary: 'Active profiles', metric: 'Profiles', value: String(data.profiles.filter((profile) => profile.role === 'student' && profile.status === 'active').length), status: 'recorded', detail: 'Live Supabase profiles', date: '—' },
    { id: 'admin-faculty', primary: 'Faculty', secondary: 'Active profiles', metric: 'Profiles', value: String(data.profiles.filter((profile) => profile.role === 'faculty' && profile.status === 'active').length), status: 'recorded', detail: 'Live Supabase profiles', date: '—' },
    { id: 'admin-attendance', primary: 'Attendance', secondary: 'Weighted finalized sessions', metric: 'Attendance percentage', value: displayPercent(present, total), status: 'recorded', detail: `${finalized.length} finalized session(s) · ${attendanceRows.filter((row) => row.status === 'shortage').length} shortage student(s)`, date: '—' },
    { id: 'admin-requests', primary: 'Approvals', secondary: 'Requests pending workflow action', metric: 'Pending requests', value: String(data.requests.filter((request) => pendingRequestStatuses.has(request.status)).length), status: 'pending', detail: 'Leave, Gate Pass and OD requests', date: '—' },
    { id: 'admin-corrections', primary: 'Corrections', secondary: 'Attendance and marks corrections', metric: 'Pending corrections', value: String(data.attendanceCorrections.filter((item) => item.status === 'pending').length + data.markCorrections.filter((item) => item.status === 'pending').length), status: 'pending', detail: 'Existing Faculty/HOD correction workflow', date: '—' },
    { id: 'admin-unallocated', primary: 'Unallocated Subjects', secondary: 'Active subjects without active subject faculty', metric: 'Allocation coverage', value: String(data.subjects.filter((subject) => subject.is_active && !data.assignments.some((assignment) => assignment.subject_id === subject.id && assignment.assignment_type === 'subject_faculty' && assignment.is_active)).length), status: 'warning', detail: 'No subject allocation records are created here', date: '—' },
  ]
  return rows
}

function buildRows(data: ReportingData, kind: ReportKind, filters: ReportFilters): ReportRow[] {
  const rows = kind === 'attendance' ? buildAttendanceRows(data, filters)
    : kind === 'marks' ? buildMarksRows(data, filters)
      : kind === 'leave' || kind === 'gate_pass' || kind === 'od' ? buildRequestRows(data, filters, kind)
        : kind === 'complaints' ? buildComplaintRows(data, filters)
          : kind === 'workload' ? buildWorkloadRows(data, filters)
            : kind === 'audit' ? buildAuditRows(data, filters)
              : buildAdministrativeRows(data, filters)
  const query = filters.search.trim().toLowerCase()
  return rows.filter((row) => (!filters.status || row.status === filters.status) && (!query || [row.primary, row.secondary, row.metric, row.value, row.status, row.detail, row.date].join(' ').toLowerCase().includes(query)))
}

function csv(name: string, rows: ReportRow[]) {
  const escape = (value: string) => `"${safe(value).replace(/"/g, '""')}"`
  const body = [['Primary', 'Secondary', 'Metric', 'Value', 'Status', 'Detail', 'Date'], ...rows.map((row) => [row.primary, row.secondary, row.metric, row.value, display(row.status), row.detail, row.date])].map((row) => row.map(escape).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function AdminReportsPage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => reportingRepository.load(), [])
  const resource = useAsyncResource(load)
  const [report, setReport] = useState<ReportKind>('attendance')
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters)
  const data = resource.data
  const rowResult = useMemo(() => {
    if (!data) return { rows: [] as ReportRow[], error: null as string | null }
    try { return { rows: buildRows(data, report, filters), error: null } } catch (error) { return { rows: [] as ReportRow[], error: error instanceof Error ? error.message : 'This report could not be calculated.' } }
  }, [data, filters, report])
  const unfilteredStatuses = useMemo(() => data ? [...new Set(buildRows(data, report, { ...filters, status: '', search: '' }).map((row) => row.status))].sort() : [], [data, filters, report])
  const update = <Key extends keyof ReportFilters>(key: Key, value: ReportFilters[Key]) => setFilters((current) => ({ ...current, [key]: value, ...(key === 'academicYearId' ? { semesterId: '', sectionId: '' } : {}), ...(key === 'semesterId' || key === 'studyYear' ? { sectionId: '' } : {}) }))
  const selected = reportTabs.find((tab) => tab.kind === report)?.label ?? 'Report'
  const rows = rowResult.rows
  const total = rows.length
  const successCount = rows.filter((row) => /active|approved|complete|finalized|locked|ok|recorded|resolved|verified/i.test(row.status)).length

  if (currentUser && currentUser.role !== USER_ROLES.superAdmin) return <ErrorState title="Reports access denied" description="Only the Super Admin can open Admin reports." />
  if (resource.isLoading) return <LoadingState label="Loading live Admin reports…" />
  if (resource.error || !data) return <div className="space-y-3"><ErrorState title="Reports unavailable" description={resource.error ?? 'No reporting data was returned.'} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>

  const semesters = data.semesters.filter((semester) => !filters.academicYearId || semester.academic_year_id === filters.academicYearId)
  const sections = data.sections.filter((section) => (!filters.academicYearId || section.academic_year_id === filters.academicYearId) && (!filters.semesterId || section.semester_id === filters.semesterId) && (!filters.studyYear || String(section.year_number) === filters.studyYear))

  return <div className="space-y-6">
    <PageHeader title="Admin reports" description="Live Supabase reporting for Attendance, Marks, Leave, Gate Pass, OD, Complaints, Faculty workload, Audit and administrative summary." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button>} />
    <Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-semibold">Report<Select className="mt-1" value={report} onChange={(event) => setReport(event.target.value as ReportKind)}>{reportTabs.map((tab) => <option key={tab.kind} value={tab.kind}>{tab.label}</option>)}</Select></label>
        <label className="text-sm font-semibold">Academic Year<Select className="mt-1" value={filters.academicYearId} onChange={(event) => update('academicYearId', event.target.value)}><option value="">All academic years</option>{data.academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></label>
        <label className="text-sm font-semibold">Semester<Select className="mt-1" value={filters.semesterId} onChange={(event) => update('semesterId', event.target.value)}><option value="">All semesters</option>{semesters.map((semester) => <option key={semester.id} value={semester.id}>Semester {semester.number}</option>)}</Select></label>
        <label className="text-sm font-semibold">Study Year<Select className="mt-1" value={filters.studyYear} onChange={(event) => update('studyYear', event.target.value)}><option value="">All study years</option><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option></Select></label>
        <label className="text-sm font-semibold">Section<Select className="mt-1" value={filters.sectionId} onChange={(event) => update('sectionId', event.target.value)}><option value="">All sections</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name} · Year {section.year_number}</option>)}</Select></label>
        <label className="text-sm font-semibold">From date<Input className="mt-1" type="date" value={filters.fromDate} onChange={(event) => update('fromDate', event.target.value)} /></label>
        <label className="text-sm font-semibold">To date<Input className="mt-1" type="date" value={filters.toDate} onChange={(event) => update('toDate', event.target.value)} /></label>
        <label className="text-sm font-semibold">Status<Select className="mt-1" value={filters.status} onChange={(event) => update('status', event.target.value)}><option value="">All statuses</option>{unfilteredStatuses.map((status) => <option key={status} value={status}>{display(status)}</option>)}</Select></label>
        <label className="text-sm font-semibold xl:col-span-2">Search<Input className="mt-1" value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Search names, register numbers, faculty IDs, subjects, sections or statuses" /></label>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setFilters(emptyFilters)}>Clear filters</Button><Button disabled={!rows.length} onClick={() => csv(selected.toLowerCase().replace(/\s+/g, '-'), rows)}><Download className="size-4" /> Export CSV</Button></div>
    </Card>
    {rowResult.error && <div className="space-y-3"><ErrorState title={`${selected} report unavailable`} description={`${rowResult.error} Other report tabs can still be opened.`} /><Button variant="secondary" onClick={() => setReport('attendance')}>Open Attendance report</Button></div>}
    <div className="grid gap-4 sm:grid-cols-3">
      <Card><p className="text-sm text-muted">Rows</p><p className="mt-1 text-2xl font-bold">{total}</p></Card>
      <Card><p className="text-sm text-muted">Healthy / complete</p><p className="mt-1 text-2xl font-bold text-success">{successCount}</p></Card>
      <Card><p className="text-sm text-muted">Filtered date range</p><p className="mt-1 text-sm font-bold">{filters.fromDate || 'Start'} → {filters.toDate || 'Today'}</p></Card>
    </div>
    <Card>
      <h2 className="font-bold text-text">{selected}</h2>
      <p className="mt-1 text-sm text-muted">Filters update these summary cards, table rows and CSV export together.</p>
      <div className="mt-4"><DataTable rows={rows} empty={<EmptyState title="No live report data for the selected filters" description="Change filters, retry, or verify that records exist in Supabase." />} columns={[
        { header: 'Name / record', render: (row) => <div><p className="font-semibold">{row.primary}</p><p className="text-xs text-muted">{row.secondary}</p></div> },
        { header: 'Metric', render: (row) => <span className="block max-w-xs whitespace-normal">{row.metric}</span> },
        { header: 'Value', render: (row) => row.value },
        { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{display(row.status)}</Badge> },
        { header: 'Details', render: (row) => <span className="block max-w-md whitespace-normal text-xs text-muted">{row.detail}</span> },
        { header: 'Date', render: (row) => row.date },
      ]} /></div>
    </Card>
  </div>
}
