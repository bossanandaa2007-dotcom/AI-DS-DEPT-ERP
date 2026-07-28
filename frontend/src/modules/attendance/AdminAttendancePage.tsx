import { RefreshCw, Search } from 'lucide-react'
import { useCallback, useState } from 'react'

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
import { findAiDsDepartment } from '@/lib/departments'
import { useAuth } from '@/modules/auth/useAuth'
import { attendanceRepository, type AttendanceData, type AttendanceSessionRow } from '@/services/supabase/attendanceRepository'

type StudentSummary = {
  id: string
  registerNumber: string
  name: string
  present: number
  late: number
  absent: number
  finalizedSessions: number
  attendancePercent: number | null
  shortage: boolean
}

type SessionSummary = {
  id: string
  date: string
  subject: string
  period: string
  faculty: string
  section: string
  present: number
  late: number
  absent: number
  status: string
}

const today = () => new Date().toISOString().slice(0, 10)
const thirtyDaysAgo = () => {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString().slice(0, 10)
}
const shortageThreshold = 75
const finalizedStatuses = new Set(['finalized', 'locked'])
const draftStatuses = new Set(['draft', 'open', 'cancelled'])
const tone = (status: string): 'success' | 'warning' | 'primary' | 'muted' => finalizedStatuses.has(status) ? 'success' : status === 'draft' || status === 'open' ? 'warning' : status === 'cancelled' ? 'muted' : 'primary'
const percent = (numerator: number, denominator: number) => denominator === 0 ? null : (numerator / denominator) * 100
const displayPercent = (value: number | null) => value === null ? '—' : value === 0 ? '0%' : `${Number.isInteger(value) ? value : value.toFixed(1)}%`
const isNotCancelled = (status: string) => status !== 'cancelled'

export function AdminAttendancePage() {
  const { currentUser } = useAuth()
  const resource = useAsyncResource(useCallback(() => attendanceRepository.loadAttendanceData(), []))
  const [academicYearId, setAcademicYearId] = useState('')
  const [semesterId, setSemesterId] = useState('')
  const [studyYear, setStudyYear] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo())
  const [dateTo, setDateTo] = useState(today())
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sessionDateFilter, setSessionDateFilter] = useState('')

  if (!currentUser || currentUser.role !== USER_ROLES.superAdmin) return <ErrorState title="Super Admin access required" description="Admin Attendance is available only to the Super Admin." />
  if (resource.isLoading) return <LoadingState label="Loading Admin Attendance..." />
  if (resource.error) return <div className="space-y-4"><ErrorState title="Unable to load Admin Attendance" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  const data = resource.data
  if (!data) return null

  const aiDepartment = findAiDsDepartment(data.departments)
  if (!aiDepartment) return <ErrorState title="Department unavailable" description="Create a department before viewing Admin Attendance." />
  const studyYearNumber = Number(studyYear)
  const academicYears = data.academicYears.filter((item) => item.department_id === aiDepartment.id && item.is_active)
  const semesters = data.semesters.filter((item) => item.academic_year_id === academicYearId && item.is_active)
  const sections = data.sections.filter((item) => item.department_id === aiDepartment.id && item.academic_year_id === academicYearId && item.semester_id === semesterId && item.year_number === studyYearNumber && item.is_active)
  const selectedSection = data.sections.find((item) => item.id === sectionId)
  const subjects = data.subjects.filter((item) => item.department_id === aiDepartment.id && item.semester_id === semesterId && item.study_year === studyYearNumber && item.is_active)
  const inDateRange = (date: string) => (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo)
  const contextReady = Boolean(academicYearId && semesterId && studyYear && sectionId && dateFrom && dateTo && (!dateTo || !dateFrom || dateTo >= dateFrom))
  const contextSessions = contextReady ? data.sessions.filter((session) => session.section_id === sectionId && inDateRange(session.attendance_date) && isNotCancelled(session.status)) : []
  const finalizedSessions = contextSessions.filter((session) => finalizedStatuses.has(session.status))
  const visibleSessions = contextSessions.filter((session) => (subjectFilter === 'all' || session.subject_id === subjectFilter) && (statusFilter === 'all' || session.status === statusFilter) && (!sessionDateFilter || session.attendance_date === sessionDateFilter))
  const activeEnrollments = data.enrollments.filter((row) => row.section_id === sectionId && row.status === 'active')
  const activeStudents = activeEnrollments.map((enrollment) => data.profiles.find((profile) => profile.id === enrollment.student_id && profile.role === 'student' && profile.status === 'active')).filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
  const studentRows = buildStudentRows(data, activeStudents, finalizedSessions).filter((row) => `${row.name} ${row.registerNumber}`.toLowerCase().includes(search.toLowerCase()))
  const filteredStudentRows = subjectFilter === 'all' ? studentRows : buildStudentRows(data, activeStudents, finalizedSessions.filter((session) => session.subject_id === subjectFilter)).filter((row) => `${row.name} ${row.registerNumber}`.toLowerCase().includes(search.toLowerCase()))
  const denominator = filteredStudentRows.reduce((total, row) => total + row.finalizedSessions, 0)
  const attended = filteredStudentRows.reduce((total, row) => total + row.present + row.late, 0)
  const pendingCorrectionCount = data.corrections.filter((correction) => correction.status === 'pending' && activeStudents.some((student) => student.id === correction.student_id) && data.records.some((record) => record.id === correction.attendance_record_id && finalizedSessions.some((session) => session.id === record.session_id))).length
  const sessionRows = visibleSessions.map((session) => summarizeSession(data, session, activeStudents.length))

  const resetAfterYear = (value: string) => { setAcademicYearId(value); setSemesterId(''); setStudyYear(''); setSectionId(''); setSubjectFilter('all') }
  const resetAfterSemester = (value: string) => { setSemesterId(value); setStudyYear(''); setSectionId(''); setSubjectFilter('all') }
  const resetAfterStudyYear = (value: string) => { setStudyYear(value); setSectionId(''); setSubjectFilter('all') }

  return <div className="space-y-6">
    <PageHeader title="Admin Attendance" description="Read-only AI-DS attendance monitoring by academic context and date range." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    <Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Select value={academicYearId} onChange={(event) => resetAfterYear(event.target.value)}><option value="">Academic Year</option>{academicYears.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <Select value={semesterId} onChange={(event) => resetAfterSemester(event.target.value)}><option value="">Semester</option>{semesters.map((item) => <option key={item.id} value={item.id}>Semester {item.number}</option>)}</Select>
        <Select value={studyYear} onChange={(event) => resetAfterStudyYear(event.target.value)}><option value="">Study Year</option>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>Year {item}</option>)}</Select>
        <Select value={sectionId} onChange={(event) => { setSectionId(event.target.value); setSubjectFilter('all') }}><option value="">Section</option>{sections.map((item) => <option key={item.id} value={item.id}>{item.name}{item.batch ? ` - ${item.batch}` : ''}</option>)}</Select>
        <Input aria-label="Date from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input aria-label="Date to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>
      {dateFrom && dateTo && dateTo < dateFrom && <p className="mt-3 text-sm text-error">Date range end cannot be before start.</p>}
    </Card>

    {!contextReady ? <EmptyState title="Select academic context and date range" description="Attendance monitoring appears after Academic Year, Semester, Study Year, Section, and dates are selected." /> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Overall Attendance" value={displayPercent(percent(attended, denominator))} />
        <Metric label="Total Students" value={activeStudents.length.toString()} />
        <Metric label="Finalized Sessions" value={finalizedSessions.length.toString()} />
        <Metric label="Draft Sessions" value={contextSessions.filter((session) => draftStatuses.has(session.status)).length.toString()} />
        <Metric label="Attendance Shortage" value={filteredStudentRows.filter((row) => row.shortage).length.toString()} />
        <Metric label="Pending Corrections" value={pendingCorrectionCount.toString()} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold text-text">Student Attendance</h2><p className="text-sm text-muted">{selectedSection?.name ?? 'Selected section'} weighted by active enrollment and finalized sessions.</p></div>
          <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input className="pl-9" placeholder="Search student or register number" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All Subjects</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}</Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All Session Statuses</option><option value="draft">Draft</option><option value="open">Open</option><option value="finalized">Finalized</option><option value="locked">Locked</option></Select>
          <Input aria-label="Filter sessions by date" type="date" value={sessionDateFilter} onChange={(event) => setSessionDateFilter(event.target.value)} />
        </div>
        <div className="mt-4"><DataTable rows={filteredStudentRows} empty={<EmptyState title="No enrolled students match the filters" />} columns={[
          { header: 'Register Number', render: (row) => row.registerNumber || '—' },
          { header: 'Student Name', render: (row) => row.name },
          { header: 'Present', render: (row) => row.finalizedSessions ? row.present : '—' },
          { header: 'Late', render: (row) => row.finalizedSessions ? row.late : '—' },
          { header: 'Absent', render: (row) => row.finalizedSessions ? row.absent : '—' },
          { header: 'Finalized Sessions', render: (row) => row.finalizedSessions },
          { header: 'Attendance %', render: (row) => displayPercent(row.attendancePercent) },
          { header: 'Shortage', render: (row) => row.attendancePercent === null ? <Badge>—</Badge> : row.shortage ? <Badge tone="warning">Shortage</Badge> : <Badge tone="success">Clear</Badge> },
        ]} /></div>
      </Card>

      <Card>
        <h2 className="font-bold text-text">Session View</h2>
        <div className="mt-4"><DataTable rows={sessionRows} empty={<EmptyState title="No sessions match the current filters" />} columns={[
          { header: 'Date', render: (row) => row.date },
          { header: 'Subject', render: (row) => row.subject },
          { header: 'Period', render: (row) => row.period },
          { header: 'Faculty', render: (row) => row.faculty },
          { header: 'Section', render: (row) => row.section },
          { header: 'Counts', render: (row) => <span>Present {row.present} · Late {row.late} · Absent {row.absent}</span> },
          { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{row.status.replace('_', ' ')}</Badge> },
        ]} /></div>
      </Card>
    </>}
  </div>
}

function buildStudentRows(data: AttendanceData, students: AttendanceData['profiles'], finalizedSessions: AttendanceSessionRow[]): StudentSummary[] {
  return students.map((student) => {
    const records = data.records.filter((record) => record.student_id === student.id && finalizedSessions.some((session) => session.id === record.session_id))
    const present = records.filter((record) => record.status === 'present').length
    const late = records.filter((record) => record.status === 'late').length
    const attendancePercent = percent(present + late, finalizedSessions.length)
    return { id: student.id, registerNumber: student.employee_or_register_number ?? '', name: student.full_name, present, late, absent: finalizedSessions.length ? Math.max(finalizedSessions.length - present - late, 0) : 0, finalizedSessions: finalizedSessions.length, attendancePercent, shortage: attendancePercent !== null && attendancePercent < shortageThreshold }
  })
}

function summarizeSession(data: AttendanceData, session: AttendanceSessionRow, activeStudentCount: number): SessionSummary {
  const records = data.records.filter((record) => record.session_id === session.id)
  const present = records.filter((record) => record.status === 'present').length
  const late = records.filter((record) => record.status === 'late').length
  const recordedAbsent = records.filter((record) => record.status === 'absent').length
  const isFinal = finalizedStatuses.has(session.status)
  return {
    id: session.id,
    date: session.attendance_date,
    subject: data.subjects.find((subject) => subject.id === session.subject_id)?.name ?? 'Daily attendance',
    period: session.period ? `Period ${session.period}` : 'Daily',
    faculty: data.profiles.find((profile) => profile.id === session.faculty_id)?.full_name ?? '—',
    section: data.sections.find((section) => section.id === session.section_id)?.name ?? '—',
    present,
    late,
    absent: isFinal ? Math.max(activeStudentCount - present - late, 0) : recordedAbsent,
    status: session.status,
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-text">{value}</p></Card>
}
