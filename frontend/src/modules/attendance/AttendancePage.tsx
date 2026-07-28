import { AlertTriangle, CalendarDays, CheckCheck, FileText, LockKeyhole, RefreshCw, ShieldCheck, TrendingUp, UserCheck, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { DataTable } from '@/components/common/DataTable'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { getCheckInWindowState } from '@/lib/date-time'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { PrivateFileInput } from '@/modules/document-reviews/PrivateFileInput'
import {
  attendanceRepository,
  type AttendanceCorrectionRow,
  type AttendanceData,
  type AttendanceRecordRow,
  type AttendanceSessionRow,
  type AttendanceStatus,
} from '@/services/supabase/attendanceRepository'

const statuses: AttendanceStatus[] = ['present', 'late', 'absent']
type FacultyDraftStatus = AttendanceStatus | 'od' | 'leave'
const facultyStatuses: FacultyDraftStatus[] = ['present', 'absent', 'od', 'leave']
const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const today = () => new Date().toISOString().slice(0, 10)
const tone = (status: string): 'success' | 'warning' | 'primary' | 'muted' => status === 'present' || status === 'finalized' ? 'success' : status === 'late' || status === 'open' || status === 'pending' ? 'warning' : status === 'absent' || status === 'rejected' ? 'muted' : 'primary'
const readable = (value: string) => value.replaceAll('_', ' ')
const requiredAttendancePercent = 75
const finalizedSessionStatuses = new Set(['finalized', 'locked'])
const approvedRequestStatuses = new Set(['hod_approved', 'finalized', 'certificate_verified'])
type AttendanceDisplayStatus = AttendanceStatus | 'od' | 'leave'
type EligibilityStatus = 'Safe' | 'Warning' | 'Shortage'
type StudentSubjectRow = {
  id: string
  code: string
  name: string
  faculty: string
  conducted: number
  attended: number
  absent: number
  excused: number
  percentage: number | null
  shortage: boolean
}
type StudentHistoryRow = {
  id: string
  date: string
  period: string
  subjectId: string
  subject: string
  faculty: string
  status: AttendanceDisplayStatus
  sessionStatus: string
  record: AttendanceRecordRow | null
  correction: AttendanceCorrectionRow | null
  canRequestCorrection: boolean
  correctionBlockedReason: string | null
}
type DepartmentStudentAttendanceRow = {
  id: string
  registerNumber: string
  student: string
  year: string
  section: string
  subject: string
  faculty: string
  conducted: number
  present: number
  late: number
  absent: number
  excused: number
  percentage: number | null
  shortage: boolean
}
type FacultyAttendanceState = { date?: string; sectionId?: string; subjectId?: string; periodId?: string; dailySectionId?: string }

function readFacultyAttendanceState(key: string): FacultyAttendanceState {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) as FacultyAttendanceState : {}
  } catch {
    return {}
  }
}

function readFacultyAttendanceDraft(key: string): Record<string, FacultyDraftStatus> {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) as Record<string, FacultyDraftStatus> : {}
  } catch {
    return {}
  }
}

function approvedExcuse(data: AttendanceData, studentId: string, date: string): 'od' | 'leave' | null {
  const request = data.requests.find((row) => row.requester_id === studentId && approvedRequestStatuses.has(row.status) && row.from_date && row.to_date && row.from_date <= date && row.to_date >= date && (row.request_type === 'od' || row.request_type === 'student_leave'))
  if (!request) return null
  return request.request_type === 'od' ? 'od' : 'leave'
}

function statusToSave(status: FacultyDraftStatus): AttendanceStatus {
  return status === 'od' || status === 'leave' ? 'absent' : status
}

const formatPercent = (value: number | null) => value === null ? '--' : `${Number.isInteger(value) ? value : value.toFixed(1)}%`
const percentage = (earned: number, conducted: number) => conducted === 0 ? null : (earned / conducted) * 100
const statusLabel = (status: AttendanceDisplayStatus | string) => status === 'od' ? 'OD' : status === 'leave' ? 'Leave' : readable(status)
const displayDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '--'
const displayDateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '--'
const displayStatusTone = (status: AttendanceDisplayStatus | string): 'success' | 'warning' | 'primary' | 'muted' => {
  if (status === 'present' || status === 'late' || status === 'od' || status === 'leave' || status === 'approved') return 'success'
  if (status === 'pending' || status === 'open' || status === 'draft') return 'warning'
  if (status === 'absent' || status === 'rejected') return 'muted'
  return 'primary'
}

export function AttendancePage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => attendanceRepository.loadAttendanceData(), [])
  const resource = useAsyncResource(load)
  if (currentUser?.role === 'student' && resource.isLoading) return <StudentAttendanceSkeleton />
  if (resource.isLoading) return <LoadingState label="Loading attendance…" />
  if (resource.error) return <div className="space-y-4"><ErrorState title="Unable to load attendance" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  if (!currentUser || !resource.data) return null
  const common = { data: resource.data, reload: resource.reload, userId: currentUser.id }
  if (currentUser.role === 'student') return <StudentAttendance {...common} />
  if (currentUser.role === 'faculty') return <FacultyAttendance {...common} />
  if (currentUser.role === 'hod' || currentUser.role === 'super_admin') return <DepartmentAttendance {...common} />
  return <StaffAttendanceView {...common} />
}

function StudentAttendance({ data, reload, userId }: ViewProps) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [correctionRow, setCorrectionRow] = useState<StudentHistoryRow | null>(null)
  const [requestedStatus, setRequestedStatus] = useState<AttendanceStatus>('present')
  const [reason, setReason] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofError, setProofError] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const date = today()
  const enrollment = useMemo(() => data.enrollments.find((row) => row.student_id === userId && row.status === 'active'), [data.enrollments, userId])
  const profile = data.profiles.find((row) => row.id === userId)
  const sectionId = enrollment?.section_id ?? profile?.section_id
  const section = data.sections.find((row) => row.id === sectionId)
  const academicYear = data.academicYears.find((row) => row.id === enrollment?.academic_year_id || row.id === section?.academic_year_id)
  const semester = data.semesters.find((row) => row.id === section?.semester_id)
  const dailySession = data.sessions.find((row) => row.session_type === 'daily' && row.section_id === sectionId && row.attendance_date === date)
  const dailyRecord = data.records.find((row) => row.session_id === dailySession?.id && row.student_id === userId)
  const personalCorrections = data.corrections.filter((row) => row.student_id === userId)
  const windowState = getCheckInWindowState(new Date())
  const studentView = useMemo(() => buildStudentAttendanceView(data, userId, sectionId ?? undefined), [data, userId, sectionId])
  const filteredHistory = studentView.history.filter((row) => {
    const inDateRange = (!fromDate || row.date >= fromDate) && (!toDate || row.date <= toDate)
    const subjectMatches = subjectFilter === 'all' || row.subjectId === subjectFilter
    const statusMatches = statusFilter === 'all' || row.status === statusFilter
    return inDateRange && subjectMatches && statusMatches
  })
  const eligibilityTone = studentView.eligibility === 'Safe' ? 'success' : studentView.eligibility === 'Warning' ? 'warning' : 'muted'

  const checkIn = async () => {
    if (!dailySession) { setMessage('Your Class Teacher has not opened today’s daily check-in session.'); return }
    setSaving(true); setMessage('')
    try { await attendanceRepository.studentDailyCheckIn(dailySession.id); await reload(); setMessage('Daily check-in submitted for Faculty verification.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to check in.') } finally { setSaving(false) }
  }
  const requestCorrection = async () => {
    if (!correctionRow?.record) return
    if (proofFile) { setMessage('Supporting proof upload is not available for attendance corrections in the current backend. Remove the file and submit the correction reason.'); return }
    setSaving(true); setMessage('')
    try { await attendanceRepository.requestCorrection(correctionRow.record, requestedStatus, reason); await reload(); setCorrectionRow(null); setReason(''); setProofFile(null); setProofError(''); setMessage('Attendance correction submitted.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to request correction.') } finally { setSaving(false) }
  }

  return <div className="space-y-6">
    <PageHeader title="My attendance" description="Finalized subject attendance, approved OD/leave, and correction tracking from your authenticated student profile." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    {message && <Feedback message={message} />}
    {!enrollment || !sectionId ? <EmptyState title="No active enrollment found" description="Attendance appears after your active enrollment and section are mapped to your profile." /> : <>
      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><p className="eyebrow">Active academic context</p><h2 className="mt-1 text-lg font-bold text-text">{section?.name ?? 'Assigned section'}{section?.batch ? ` - ${section.batch}` : ''}</h2><p className="mt-1 text-sm text-muted">{academicYear?.name ?? 'Current academic year'} - {semester ? `Semester ${semester.number}` : 'Current semester'}</p></div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone={eligibilityTone}>{studentView.eligibility}</Badge><span className="text-sm text-muted">Minimum {requiredAttendancePercent}% required</span></div>
        </div>
      </Card>
      <section aria-label="Attendance summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StudentMetric label="Overall attendance" value={formatPercent(studentView.overallPercentage)} detail="Present, late, OD, and approved leave over conducted classes" icon={TrendingUp} tone={eligibilityTone} />
        <StudentMetric label="Conducted classes" value={studentView.summary.conducted.toString()} detail="Finalized subject and lab sessions" icon={CalendarDays} />
        <StudentMetric label="Present" value={studentView.summary.present.toString()} detail={`${studentView.summary.late} late counted as attended`} icon={UserCheck} tone="success" />
        <StudentMetric label="Absent" value={studentView.summary.absent.toString()} detail="Unexcused absences only" icon={AlertTriangle} tone={studentView.summary.absent ? 'warning' : 'success'} />
        <StudentMetric label="OD" value={studentView.summary.od.toString()} detail="Approved OD dates overlapping sessions" icon={ShieldCheck} tone="primary" />
        <StudentMetric label="Approved leave" value={studentView.summary.leave.toString()} detail="Approved student leave dates overlapping sessions" icon={FileText} tone="primary" />
        <StudentMetric label="Required minimum" value={`${requiredAttendancePercent}%`} detail="Eligibility threshold" icon={LockKeyhole} />
        <StudentMetric label="Eligibility" value={studentView.eligibility} detail={studentView.eligibilityDetail} icon={CheckCheck} tone={eligibilityTone} />
      </section>
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="font-bold text-text">Today&apos;s daily check-in</h2><p className="mt-1 text-sm text-muted">{displayDate(date)} - Check-in window: {readable(windowState)}</p></div>
          <div className="flex flex-wrap items-center gap-3">{dailyRecord ? <><Badge tone={displayStatusTone(dailySession?.status ?? dailyRecord.status)}>{dailySession?.status === 'finalized' ? 'finalized' : statusLabel(dailyRecord.status)}</Badge><span className="text-sm text-muted">{dailyRecord.check_in_time ? `Checked in at ${new Date(dailyRecord.check_in_time).toLocaleTimeString()}` : 'Entered by Faculty'}</span></> : <Button disabled={saving || windowState !== 'open' || !dailySession} onClick={() => void checkIn()}><UserCheck className="size-4" /> {saving ? 'Checking in...' : 'Check in'}</Button>}</div>
        </div>
        {!dailySession && <p className="mt-3 text-sm text-warning">Daily check-in becomes available after the Class Teacher opens today&apos;s session.</p>}
      </Card>
      <StudentSubjectAttendance rows={studentView.subjects} />
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div><h2 className="font-bold text-text">Attendance history</h2><p className="mt-1 text-sm text-muted">Filter finalized subject and lab sessions by date, subject, or attendance status.</p></div>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
            <label className="text-xs font-semibold text-muted">From<Input className="mt-1" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
            <label className="text-xs font-semibold text-muted">To<Input className="mt-1" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
            <label className="text-xs font-semibold text-muted">Subject<Select className="mt-1" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{studentView.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code}</option>)}</Select></label>
            <label className="text-xs font-semibold text-muted">Status<Select className="mt-1" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="od">OD</option><option value="leave">Leave</option></Select></label>
          </div>
        </div>
        {toDate && fromDate && toDate < fromDate && <p className="mt-3 text-sm text-error">Date range end cannot be before start.</p>}
        <StudentHistoryList rows={filteredHistory} onRequest={(row) => { setCorrectionRow(row); setRequestedStatus(row.status === 'present' || row.status === 'late' ? 'absent' : 'present'); setReason(''); setProofFile(null); setProofError('') }} />
      </Card>
      <StudentCorrectionsPanel corrections={personalCorrections} history={studentView.history} profiles={data.profiles} />
    </>}
    <StudentCorrectionRequestDialog row={correctionRow} requestedStatus={requestedStatus} setRequestedStatus={setRequestedStatus} reason={reason} setReason={setReason} proofFile={proofFile} setProofFile={setProofFile} proofError={proofError} setProofError={setProofError} saving={saving} onClose={() => setCorrectionRow(null)} onSubmit={requestCorrection} />
  </div>
}

function StudentAttendanceSkeleton() {
  return <div className="space-y-6" aria-live="polite" aria-label="Loading student attendance">
    <div className="h-16 animate-pulse rounded-lg bg-border/50" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-border bg-surface" />)}</div>
    <div className="h-72 animate-pulse rounded-xl border border-border bg-surface" />
  </div>
}

function StudentMetric({ label, value, detail, icon: Icon, tone: badgeTone = 'muted' }: { label: string; value: string; detail: string; icon: LucideIcon; tone?: 'success' | 'warning' | 'primary' | 'muted' }) {
  return <Card className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-2xl font-bold text-text">{value}</p><p className="mt-1 text-sm leading-5 text-muted">{detail}</p></div><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${badgeTone === 'success' ? 'bg-success/10 text-success' : badgeTone === 'warning' ? 'bg-warning/10 text-warning' : badgeTone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-background text-muted'}`}><Icon className="size-4" aria-hidden="true" /></span></div></Card>
}

function StudentSubjectAttendance({ rows }: { rows: StudentSubjectRow[] }) {
  return <Card><div className="flex flex-col gap-1"><h2 className="font-bold text-text">Subject-wise attendance</h2><p className="text-sm text-muted">Every active enrolled subject is shown, including assigned faculty and shortage status.</p></div><div className="mt-4 hidden md:block"><DataTable rows={rows} empty={<EmptyState title="No enrolled subjects found" description="Subjects appear after the active section, semester, and timetable are configured." />} columns={[{ header: 'Subject', render: (row) => <div><p className="font-semibold">{row.code}</p><p className="text-xs text-muted">{row.name}</p></div> }, { header: 'Faculty', render: (row) => row.faculty }, { header: 'Conducted', render: (row) => row.conducted }, { header: 'Attended', render: (row) => row.attended }, { header: 'Absent', render: (row) => row.absent }, { header: 'OD/Leave', render: (row) => row.excused }, { header: 'Percentage', render: (row) => <ProgressValue value={row.percentage} /> }, { header: 'Status', render: (row) => row.percentage === null ? <Badge>Not started</Badge> : row.shortage ? <Badge tone="warning">Shortage</Badge> : <Badge tone="success">Clear</Badge> }]} /></div><div className="mt-4 grid gap-3 md:hidden">{rows.length ? rows.map((row) => <SubjectMobileCard key={row.id} row={row} />) : <EmptyState title="No enrolled subjects found" description="Subjects appear after the active section, semester, and timetable are configured." />}</div></Card>
}

function SubjectMobileCard({ row }: { row: StudentSubjectRow }) {
  return <article className="rounded-lg border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-bold text-text">{row.code} - {row.name}</h3><p className="mt-1 text-xs text-muted">{row.faculty}</p></div>{row.percentage === null ? <Badge>Not started</Badge> : row.shortage ? <Badge tone="warning">Shortage</Badge> : <Badge tone="success">Clear</Badge>}</div><div className="mt-3"><ProgressValue value={row.percentage} /></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><Stat label="Conducted" value={row.conducted} /><Stat label="Attended" value={row.attended} /><Stat label="Absent" value={row.absent} /><Stat label="OD/Leave" value={row.excused} /></dl></article>
}

function StudentHistoryList({ rows, onRequest }: { rows: StudentHistoryRow[]; onRequest: (row: StudentHistoryRow) => void }) {
  return <div className="mt-4"><div className="hidden md:block"><DataTable rows={rows} empty={<EmptyState title="No attendance history matches the filters" />} columns={[{ header: 'Date', render: (row) => displayDate(row.date) }, { header: 'Period/session', render: (row) => row.period }, { header: 'Subject', render: (row) => row.subject }, { header: 'Faculty', render: (row) => row.faculty }, { header: 'Status', render: (row) => <Badge tone={displayStatusTone(row.status)}>{statusLabel(row.status)}</Badge> }, { header: 'Verification', render: (row) => <Badge tone={displayStatusTone(row.sessionStatus)}>{readable(row.sessionStatus)}</Badge> }, { header: 'Correction', render: (row) => row.correction ? <Badge tone={displayStatusTone(row.correction.status)}>{readable(row.correction.status)}</Badge> : <Button className="min-h-8 px-3" variant="secondary" disabled={!row.canRequestCorrection} title={row.correctionBlockedReason ?? undefined} onClick={() => onRequest(row)}>Request</Button> }]} /></div><div className="grid gap-3 md:hidden">{rows.length ? rows.map((row) => <article key={row.id} className="rounded-lg border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-bold text-text">{row.subject}</h3><p className="mt-1 text-xs text-muted">{displayDate(row.date)} - {row.period}</p></div><Badge tone={displayStatusTone(row.status)}>{statusLabel(row.status)}</Badge></div><p className="mt-3 text-sm text-muted">{row.faculty}</p><div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone={displayStatusTone(row.sessionStatus)}>{readable(row.sessionStatus)}</Badge>{row.correction ? <Badge tone={displayStatusTone(row.correction.status)}>{readable(row.correction.status)}</Badge> : <Button className="min-h-8 px-3" variant="secondary" disabled={!row.canRequestCorrection} title={row.correctionBlockedReason ?? undefined} onClick={() => onRequest(row)}>Request correction</Button>}</div></article>) : <EmptyState title="No attendance history matches the filters" />}</div></div>
}

function StudentCorrectionsPanel({ corrections, history, profiles }: { corrections: AttendanceCorrectionRow[]; history: StudentHistoryRow[]; profiles: AttendanceData['profiles'] }) {
  const rows = corrections.map((correction) => ({ ...correction, session: history.find((row) => row.record?.id === correction.attendance_record_id) })).sort((first, second) => second.created_at.localeCompare(first.created_at))
  return <Card><h2 className="font-bold text-text">Correction requests</h2><p className="mt-1 text-sm text-muted">Track pending, approved, and rejected attendance correction reviews.</p><div className="mt-4 hidden md:block"><DataTable rows={rows} empty={<EmptyState title="No correction requests submitted" description="Eligible finalized records can be corrected from attendance history." />} columns={[{ header: 'Submitted', render: (row) => displayDateTime(row.created_at) }, { header: 'Record', render: (row) => row.session ? `${displayDate(row.session.date)} - ${row.session.subject}` : 'Attendance record' }, { header: 'Change', render: (row) => `${statusLabel(row.original_status)} -> ${statusLabel(row.requested_status)}` }, { header: 'Status', render: (row) => <Badge tone={displayStatusTone(row.status)}>{readable(row.status)}</Badge> }, { header: 'Reviewer response', render: (row) => <div><p>{row.reviewer_comments || 'No response yet'}</p><p className="text-xs text-muted">{row.reviewer_id ? profiles.find((profile) => profile.id === row.reviewer_id)?.full_name ?? 'Reviewer' : 'Awaiting reviewer'} - {displayDateTime(row.reviewed_at ?? row.updated_at)}</p></div> }]} /></div><div className="mt-4 grid gap-3 md:hidden">{rows.length ? rows.map((row) => <article key={row.id} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-text">{row.session ? `${displayDate(row.session.date)} - ${row.session.subject}` : 'Attendance record'}</h3><p className="mt-1 text-xs text-muted">{displayDateTime(row.created_at)}</p></div><Badge tone={displayStatusTone(row.status)}>{readable(row.status)}</Badge></div><p className="mt-3 text-sm text-text">{statusLabel(row.original_status)} {'->'} {statusLabel(row.requested_status)}</p><p className="mt-2 text-sm text-muted">{row.reviewer_comments || 'No response yet'}</p><p className="mt-1 text-xs text-muted">{row.reviewer_id ? profiles.find((profile) => profile.id === row.reviewer_id)?.full_name ?? 'Reviewer' : 'Awaiting reviewer'} - {displayDateTime(row.reviewed_at ?? row.updated_at)}</p></article>) : <EmptyState title="No correction requests submitted" description="Eligible finalized records can be corrected from attendance history." />}</div></Card>
}

function ProgressValue({ value }: { value: number | null }) {
  const bounded = Math.max(0, Math.min(100, value ?? 0))
  const barTone = value === null ? 'bg-muted/30' : value >= requiredAttendancePercent ? 'bg-success' : value >= 65 ? 'bg-warning' : 'bg-error'
  return <div className="min-w-[9rem]"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-text">{formatPercent(value)}</span><span className="text-xs text-muted">{requiredAttendancePercent}% min</span></div><div className="mt-2 h-2 rounded-full bg-background"><div className={`h-full rounded-full ${barTone}`} style={{ width: `${bounded}%` }} /></div></div>
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="font-semibold text-text">{value}</dd></div>
}

function buildStudentAttendanceView(data: AttendanceData, userId: string, sectionId?: string) {
  const section = data.sections.find((row) => row.id === sectionId)
  const subjectCandidates = data.subjects.filter((subject) => subject.is_active && ((section && subject.department_id === section.department_id && subject.semester_id === section.semester_id && subject.study_year === section.year_number) || data.timetable.some((entry) => entry.section_id === sectionId && entry.subject_id === subject.id && entry.is_active)))
  const subjects = [...new Map(subjectCandidates.map((subject) => [subject.id, subject])).values()]
  const sessions = data.sessions.filter((session) => session.section_id === sectionId && session.subject_id && session.session_type !== 'daily' && finalizedSessionStatuses.has(session.status))
  const recordsBySession = new Map(data.records.filter((record) => record.student_id === userId).map((record) => [record.session_id, record]))
  const approvedRequests = data.requests.filter((request) => request.requester_id === userId && approvedRequestStatuses.has(request.status) && (request.request_type === 'od' || request.request_type === 'student_leave'))
  const correctionsByRecord = new Map(data.corrections.filter((correction) => correction.student_id === userId).map((correction) => [correction.attendance_record_id, correction]))
  const facultyName = (subjectId: string) => {
    const assignment = data.assignments.find((row) => row.section_id === sectionId && row.subject_id === subjectId && row.is_active) ?? data.assignments.find((row) => row.section_id === sectionId && row.assignment_type === 'class_teacher' && row.is_active)
    const timetableFacultyId = data.timetable.find((entry) => entry.section_id === sectionId && entry.subject_id === subjectId && entry.is_active)?.faculty_id
    return data.profiles.find((profile) => profile.id === (assignment?.faculty_id ?? timetableFacultyId))?.full_name ?? 'Faculty not assigned'
  }
  const excusedKind = (dateValue: string): 'od' | 'leave' | null => {
    const match = approvedRequests.find((request) => request.from_date && request.to_date && request.from_date <= dateValue && request.to_date >= dateValue)
    if (!match) return null
    return match.request_type === 'od' ? 'od' : 'leave'
  }
  const history: StudentHistoryRow[] = sessions.map((session) => {
    const record = recordsBySession.get(session.id) ?? null
    const excused = excusedKind(session.attendance_date)
    const status: AttendanceDisplayStatus = excused && (!record || record.status === 'absent') ? excused : record?.status ?? 'absent'
    const correction = record ? correctionsByRecord.get(record.id) ?? null : null
    return { id: session.id, date: session.attendance_date, period: session.period ? `Period ${session.period}` : session.session_type, subjectId: session.subject_id!, subject: data.subjects.find((subject) => subject.id === session.subject_id)?.name ?? 'Subject', faculty: data.profiles.find((profile) => profile.id === session.faculty_id)?.full_name ?? facultyName(session.subject_id!), status, sessionStatus: session.status, record, correction, canRequestCorrection: Boolean(record && !correction && status !== 'od' && status !== 'leave'), correctionBlockedReason: !record ? 'No attendance record exists for this finalized absence.' : correction ? 'A correction request already exists for this record.' : status === 'od' || status === 'leave' ? 'Approved OD/leave records do not need correction.' : null }
  }).sort((first, second) => `${second.date}-${second.period}`.localeCompare(`${first.date}-${first.period}`))
  const subjectRows: StudentSubjectRow[] = subjects.map((subject) => {
    const rows = history.filter((row) => row.subjectId === subject.id)
    const attended = rows.filter((row) => row.status === 'present' || row.status === 'late').length
    const excused = rows.filter((row) => row.status === 'od' || row.status === 'leave').length
    const absent = rows.filter((row) => row.status === 'absent').length
    const percentValue = percentage(attended + excused, rows.length)
    return { id: subject.id, code: subject.code, name: subject.name, faculty: facultyName(subject.id), conducted: rows.length, attended, absent, excused, percentage: percentValue, shortage: percentValue !== null && percentValue < requiredAttendancePercent }
  })
  const summary = { conducted: history.length, present: history.filter((row) => row.status === 'present' || row.status === 'late').length, late: history.filter((row) => row.status === 'late').length, absent: history.filter((row) => row.status === 'absent').length, od: history.filter((row) => row.status === 'od').length, leave: history.filter((row) => row.status === 'leave').length }
  const overallPercentage = percentage(summary.present + summary.od + summary.leave, summary.conducted)
  const eligibility: EligibilityStatus = overallPercentage === null || overallPercentage >= requiredAttendancePercent ? 'Safe' : overallPercentage >= 65 ? 'Warning' : 'Shortage'
  const eligibilityDetail = overallPercentage === null ? 'No finalized classes yet' : eligibility === 'Safe' ? 'Attendance meets the minimum requirement' : eligibility === 'Warning' ? 'Close to shortage; monitor upcoming classes' : 'Below the minimum attendance requirement'
  return { summary, subjects: subjectRows, history, overallPercentage, eligibility, eligibilityDetail }
}

function FacultyAttendance({ data, reload, userId }: ViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const storageKey = `faculty-attendance-state:${userId}`
  const stored = readFacultyAttendanceState(storageKey)
  const [date, setDate] = useState(searchParams.get('date') || stored.date || today())
  const [sectionId, setSectionId] = useState(searchParams.get('sectionId') || stored.sectionId || '')
  const [subjectId, setSubjectId] = useState(searchParams.get('subjectId') || stored.subjectId || '')
  const [periodId, setPeriodId] = useState(searchParams.get('periodId') || stored.periodId || '')
  const [dailySectionId, setDailySectionId] = useState(searchParams.get('dailySectionId') || stored.dailySectionId || '')
  const draftKeyFor = (targetPeriodId = periodId, targetDate = date) => `faculty-attendance-draft:${userId}:${targetDate}:${targetPeriodId || 'none'}`
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [draftStatuses, setDraftStatuses] = useState<Record<string, FacultyDraftStatus>>(() => readFacultyAttendanceDraft(draftKeyFor()))
  const [finalizeSession, setFinalizeSession] = useState<AttendanceSessionRow | null>(null)
  const assignments = data.assignments.filter((row) => row.faculty_id === userId && row.is_active)
  const assignedSectionIds = new Set(assignments.map((row) => row.section_id))
  const dateDay = date ? new Date(`${date}T00:00:00`).getDay() || 7 : 0
  const periods = data.timetable.filter((entry) => entry.is_active && entry.faculty_id === userId && assignedSectionIds.has(entry.section_id) && entry.day_of_week === dateDay && entry.effective_from <= date && (!entry.effective_to || entry.effective_to >= date) && assignments.some((assignment) => assignment.section_id === entry.section_id && assignment.subject_id === entry.subject_id)).sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.period - b.period)
  const sectionOptions = data.sections.filter((section) => assignedSectionIds.has(section.id)).sort((a, b) => `${a.year_number}-${a.name}`.localeCompare(`${b.year_number}-${b.name}`))
  const subjectOptions = data.subjects.filter((subject) => assignments.some((assignment) => assignment.subject_id === subject.id && (!sectionId || assignment.section_id === sectionId))).sort((a, b) => a.code.localeCompare(b.code))
  const periodOptions = periods.filter((entry) => (!sectionId || entry.section_id === sectionId) && (!subjectId || entry.subject_id === subjectId))
  const classTeacherSections = data.sections.filter((section) => assignments.some((assignment) => assignment.section_id === section.id && assignment.assignment_type === 'class_teacher'))
  const selectedPeriod = periods.find((row) => row.id === periodId)
  const contextSectionId = selectedPeriod?.section_id ?? sectionId
  const contextSubjectId = selectedPeriod?.subject_id ?? subjectId
  const selectedSession = data.sessions.find((row) => row.timetable_entry_id === periodId && row.attendance_date === date)
  const dailySession = data.sessions.find((row) => row.session_type === 'daily' && row.section_id === dailySectionId && row.attendance_date === date)
  const activeStudents = (targetSectionId: string) => data.enrollments.filter((row) => row.section_id === targetSectionId && row.status === 'active').map((row) => data.profiles.find((profile) => profile.id === row.student_id)).filter((row): row is NonNullable<typeof row> => Boolean(row && row.role === 'student' && row.status === 'active')).sort((a, b) => `${a.employee_or_register_number ?? ''}-${a.full_name}`.localeCompare(`${b.employee_or_register_number ?? ''}-${b.full_name}`))
  const subjectStudents = selectedPeriod ? activeStudents(selectedPeriod.section_id) : []
  const dailyStudents = dailySectionId ? activeStudents(dailySectionId) : []
  const subjectRecords = data.records.filter((row) => row.session_id === selectedSession?.id)
  const defaultStatus = (studentId: string): FacultyDraftStatus => subjectRecords.find((row) => row.student_id === studentId)?.status ?? approvedExcuse(data, studentId, date) ?? 'present'
  const hasUnsavedChanges = Boolean(selectedSession && subjectStudents.some((student) => statusToSave(draftStatuses[student.id] ?? defaultStatus(student.id)) !== (subjectRecords.find((row) => row.student_id === student.id)?.status ?? 'present')))
  const canDiscard = () => !hasUnsavedChanges || window.confirm('Discard unsaved attendance changes?')
  const updateDate = (value: string) => { if (!canDiscard()) return; setDate(value); setPeriodId(''); setDraftStatuses(readFacultyAttendanceDraft(draftKeyFor('', value))) }
  const updateSection = (value: string) => { if (!canDiscard()) return; setSectionId(value); setSubjectId(''); setPeriodId(''); setDraftStatuses({}) }
  const updateSubject = (value: string) => { if (!canDiscard()) return; setSubjectId(value); setPeriodId(''); setDraftStatuses({}) }
  const updatePeriod = (value: string) => { if (!canDiscard()) return; setPeriodId(value); setDraftStatuses(readFacultyAttendanceDraft(draftKeyFor(value))); const entry = periods.find((row) => row.id === value); if (entry) { setSectionId(entry.section_id); setSubjectId(entry.subject_id) } }
  const setDailySection = (value: string) => { if (!canDiscard()) return; setDailySectionId(value) }

  useEffect(() => {
    const value = { date, sectionId: contextSectionId, subjectId: contextSubjectId, periodId, dailySectionId }
    window.localStorage.setItem(storageKey, JSON.stringify(value))
    const next = new URLSearchParams()
    if (date) next.set('date', date)
    if (contextSectionId) next.set('sectionId', contextSectionId)
    if (contextSubjectId) next.set('subjectId', contextSubjectId)
    if (periodId) next.set('periodId', periodId)
    if (dailySectionId) next.set('dailySectionId', dailySectionId)
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [contextSectionId, contextSubjectId, dailySectionId, date, periodId, searchParams, setSearchParams, storageKey])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => { if (!hasUnsavedChanges) return; event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  const openSubject = async () => { if (!selectedPeriod) return; setSaving(true); setMessage(''); try { const session = await attendanceRepository.openSubjectSession(selectedPeriod.id, date); await attendanceRepository.saveAllAttendance(session, subjectStudents, 'present'); window.localStorage.removeItem(draftKeyFor()); await reload(); setMessage('Subject attendance opened with all students present by default.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to open attendance.') } finally { setSaving(false) } }
  const openDaily = async () => { if (!dailySectionId) return; setSaving(true); setMessage(''); try { await attendanceRepository.openDailySession(dailySectionId, date); await reload(); setMessage('Daily attendance session opened.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to open daily attendance.') } finally { setSaving(false) } }
  const saveStatus = async (session: AttendanceSessionRow, studentId: string, status: AttendanceStatus) => { setSaving(true); setMessage(''); try { await attendanceRepository.saveAttendanceRecord(session, studentId, status); await reload() } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save attendance.') } finally { setSaving(false) } }
  const saveSubjectDraft = async () => { if (!selectedSession) return; setSaving(true); setMessage(''); try { await attendanceRepository.saveAttendanceRecords(selectedSession, Object.fromEntries(subjectStudents.map((student) => [student.id, statusToSave(draftStatuses[student.id] ?? defaultStatus(student.id))]))); window.localStorage.removeItem(draftKeyFor()); await reload(); setMessage('Attendance changes saved.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save attendance.') } finally { setSaving(false) } }
  const bulkSet = (status: FacultyDraftStatus) => { const next = Object.fromEntries(subjectStudents.map((student) => [student.id, status])); setDraftStatuses(next); window.localStorage.setItem(draftKeyFor(), JSON.stringify(next)) }
  const setDraftStatus = (studentId: string, status: FacultyDraftStatus) => setDraftStatuses((current) => { const next = { ...current, [studentId]: status }; window.localStorage.setItem(draftKeyFor(), JSON.stringify(next)); return next })
  const verifyDaily = async (record: AttendanceRecordRow, status: AttendanceStatus) => { setSaving(true); setMessage(''); try { await attendanceRepository.verifyDailyRecord(record.id, status); await reload() } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to verify check-in.') } finally { setSaving(false) } }
  const finalize = async () => { if (!finalizeSession) return; if (finalizeSession.id === selectedSession?.id && hasUnsavedChanges) { setMessage('Save attendance changes before finalizing.'); setFinalizeSession(null); return } const students = activeStudents(finalizeSession.section_id); const count = data.records.filter((record) => record.session_id === finalizeSession.id).length; if (count < students.length) { setMessage('Set attendance for every active enrolled student before finalizing.'); setFinalizeSession(null); return } setSaving(true); try { await attendanceRepository.finalizeSession(finalizeSession.id); await reload(); setFinalizeSession(null); setMessage('Attendance finalized and locked.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to finalize attendance.') } finally { setSaving(false) } }

  return <div className="space-y-6"><PageHeader title="Faculty attendance" description="Daily verification and subject attendance are restricted to active Faculty assignments." actions={<Button variant="secondary" disabled={hasUnsavedChanges} title={hasUnsavedChanges ? 'Save or discard attendance changes before refresh.' : undefined} onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />{message && <Feedback message={message} />}<Card><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold">Attendance date<Input className="mt-1" type="date" value={date} onChange={(event) => updateDate(event.target.value)} /></label><label className="text-sm font-semibold">Class / section<Select className="mt-1" value={contextSectionId} onChange={(event) => updateSection(event.target.value)}><option value="">Select section</option>{sectionOptions.map((section) => <option key={section.id} value={section.id}>Year {section.year_number} - {section.name}</option>)}</Select></label><label className="text-sm font-semibold">Subject<Select className="mt-1" value={contextSubjectId} onChange={(event) => updateSubject(event.target.value)}><option value="">Select subject</option>{subjectOptions.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}</Select></label><label className="text-sm font-semibold">Period<Select className="mt-1" value={periodId} onChange={(event) => updatePeriod(event.target.value)}><option value="">Select period</option>{periodOptions.map((entry) => <option key={entry.id} value={entry.id}>P{entry.period} - {entry.starts_at}-{entry.ends_at} - {entry.room}</option>)}</Select></label></div>{hasUnsavedChanges && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-warning"><AlertTriangle className="size-4" /> Unsaved attendance changes</p>}</Card><DailyVerificationCard data={data} session={dailySession} sections={classTeacherSections} sectionId={dailySectionId} setSectionId={setDailySection} students={dailyStudents} saving={saving} onOpen={openDaily} onVerify={verifyDaily} onSaveStatus={saveStatus} onFinalize={setFinalizeSession} /><Card><h2 className="font-bold text-text">Assigned periods for selected date</h2><div className="mt-4"><DataTable rows={periodOptions} empty={<EmptyState title="No assigned subject periods" description="Choose another date, section, or subject from your active assignments." />} columns={[{ header: 'Period', render: (entry) => `${days[entry.day_of_week]} - P${entry.period} - ${entry.starts_at}-${entry.ends_at}` }, { header: 'Subject', render: (entry) => data.subjects.find((row) => row.id === entry.subject_id)?.name ?? '-' }, { header: 'Section', render: (entry) => data.sections.find((row) => row.id === entry.section_id)?.name ?? '-' }, { header: 'Status', render: (entry) => <Badge tone={tone(data.sessions.find((session) => session.timetable_entry_id === entry.id && session.attendance_date === date)?.status ?? 'draft')}>{data.sessions.find((session) => session.timetable_entry_id === entry.id && session.attendance_date === date)?.status ?? 'not opened'}</Badge> }, { header: 'Action', render: (entry) => <Button variant={periodId === entry.id ? 'primary' : 'secondary'} onClick={() => updatePeriod(entry.id)}>{periodId === entry.id ? 'Selected' : 'Open'}</Button> }]} /></div></Card>{selectedPeriod ? <SubjectAttendanceCard data={data} period={selectedPeriod} session={selectedSession} students={subjectStudents} search={search} setSearch={setSearch} saving={saving} draftStatuses={draftStatuses} hasUnsavedChanges={hasUnsavedChanges} onOpen={openSubject} onStatusChange={setDraftStatus} onBulkSet={bulkSet} onSaveChanges={saveSubjectDraft} onFinalize={setFinalizeSession} /> : <EmptyState title="Select a period to mark attendance" description="Only periods from your active assignments for the selected date are available." />}<CorrectionReviewCard data={data} reload={reload} /><StaffSelfCard data={data} reload={reload} userId={userId} /><ConfirmDialog isOpen={Boolean(finalizeSession)} title="Finalize attendance?" description="Finalization permanently locks direct edits. Later changes require an approved correction." confirmLabel="Finalize and lock" onCancel={() => setFinalizeSession(null)} onConfirm={() => void finalize()} /></div>
}

function DailyVerificationCard({ data, session, sections, sectionId, setSectionId, students, saving, onOpen, onVerify, onSaveStatus, onFinalize }: { data: AttendanceData; session?: AttendanceSessionRow; sections: AttendanceData['sections']; sectionId: string; setSectionId: (id: string) => void; students: AttendanceData['profiles']; saving: boolean; onOpen: () => Promise<void>; onVerify: (record: AttendanceRecordRow, status: AttendanceStatus) => Promise<void>; onSaveStatus: (session: AttendanceSessionRow, studentId: string, status: AttendanceStatus) => Promise<void>; onFinalize: (session: AttendanceSessionRow) => void }) {
  const records = data.records.filter((row) => row.session_id === session?.id)
  const locked = session?.status === 'finalized' || session?.status === 'locked'
  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-text">Daily check-in verification</h2><p className="mt-1 text-sm text-muted">Available to assigned Class Teachers for their sections.</p></div>{session && <Badge tone={tone(session.status)}>{session.status}</Badge>}</div><div className="mt-4 flex flex-wrap gap-3"><Select className="max-w-sm" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">Select Class Teacher section</option>{sections.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>{sectionId && !session && <Button disabled={saving} onClick={() => void onOpen()}>Open daily session</Button>}{session && !locked && <Button variant="secondary" onClick={() => onFinalize(session)}><LockKeyhole className="size-4" /> Finalize daily attendance</Button>}</div>{session && <div className="mt-4"><DataTable rows={students} empty={<EmptyState title="No active enrolled students" />} columns={[{ header: 'Student', render: (student) => <div><p className="font-semibold">{student.full_name}</p><p className="text-xs text-muted">{student.employee_or_register_number ?? '—'}</p></div> }, { header: 'Check-in', render: (student) => { const record = records.find((row) => row.student_id === student.id); return record?.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : 'Not checked in' } }, { header: 'Verification', render: (student) => { const record = records.find((row) => row.student_id === student.id); if (locked) return <Badge tone={tone(record?.status ?? 'absent')}>{record?.status ?? 'absent'}</Badge>; if (!record) return <Select disabled={saving} defaultValue="" onChange={(event) => void onSaveStatus(session, student.id, event.target.value as AttendanceStatus)}><option value="" disabled>Set status</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</Select>; return <Select disabled={saving} value={record.status} onChange={(event) => void onVerify(record, event.target.value as AttendanceStatus)}>{statuses.map((status) => <option key={status}>{status}</option>)}</Select> } }]} /></div>}</Card>
}

function SubjectAttendanceCard({ data, period, session, students, search, setSearch, saving, draftStatuses, hasUnsavedChanges, onOpen, onStatusChange, onBulkSet, onSaveChanges, onFinalize }: { data: AttendanceData; period: AttendanceData['timetable'][number]; session?: AttendanceSessionRow; students: AttendanceData['profiles']; search: string; setSearch: (value: string) => void; saving: boolean; draftStatuses: Record<string, FacultyDraftStatus>; hasUnsavedChanges: boolean; onOpen: () => Promise<void>; onStatusChange: (studentId: string, status: FacultyDraftStatus) => void; onBulkSet: (status: FacultyDraftStatus) => void; onSaveChanges: () => Promise<void>; onFinalize: (session: AttendanceSessionRow) => void }) {
  const records = data.records.filter((row) => row.session_id === session?.id)
  const locked = session?.status === 'finalized' || session?.status === 'locked'
  const filtered = students.filter((student) => `${student.full_name} ${student.employee_or_register_number ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const displayStatus = (studentId: string): FacultyDraftStatus => draftStatuses[studentId] ?? records.find((row) => row.student_id === studentId)?.status ?? 'present'
  const counts = { present: students.filter((row) => displayStatus(row.id) === 'present').length, absent: students.filter((row) => displayStatus(row.id) === 'absent').length, od: students.filter((row) => displayStatus(row.id) === 'od').length, leave: students.filter((row) => displayStatus(row.id) === 'leave').length, saved: records.length }
  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-text">{data.subjects.find((row) => row.id === period.subject_id)?.name ?? 'Subject attendance'}</h2><p className="mt-1 text-sm text-muted">{period.starts_at}-{period.ends_at} - {period.room}</p></div>{!session ? <Button disabled={saving || !students.length} onClick={() => void onOpen()}>Start attendance</Button> : <Badge tone={tone(session.status)}>{session.status}</Badge>}</div>{!students.length && <div className="mt-4"><EmptyState title="No active enrolled students" description="Students are loaded only from this Faculty assignment and active section enrollment." /></div>}{session && students.length > 0 && <><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{Object.entries(counts).map(([label, value]) => <Card key={label} className="p-3"><p className="text-xs capitalize text-muted">{label}</p><p className="text-xl font-bold">{value}</p></Card>)}</div><div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center"><Input placeholder="Search students" value={search} onChange={(event) => setSearch(event.target.value)} />{!locked && <div className="flex flex-wrap gap-2">{facultyStatuses.map((status) => <Button key={status} className="px-3" variant="secondary" disabled={saving} onClick={() => onBulkSet(status)}>{statusLabel(status)}</Button>)}<Button disabled={saving || !hasUnsavedChanges} onClick={() => void onSaveChanges()}><CheckCheck className="size-4" /> Save changes</Button></div>}</div>{hasUnsavedChanges && <p className="mt-3 text-sm font-semibold text-warning">Unsaved changes are local until saved.</p>}<div className="mt-4 hidden md:block"><DataTable rows={filtered} empty={<EmptyState title="No students match the search" />} columns={[{ header: 'Student', render: (student) => <div><p className="font-semibold">{student.full_name}</p><p className="text-xs text-muted">{student.employee_or_register_number ?? '-'}</p></div> }, { header: 'Saved', render: (student) => { const record = records.find((row) => row.student_id === student.id); return <Badge tone={tone(record?.status ?? 'pending')}>{record?.status ?? 'pending'}</Badge> } }, { header: 'Status', render: (student) => locked ? <Badge tone={tone(records.find((row) => row.student_id === student.id)?.status ?? 'absent')}>{records.find((row) => row.student_id === student.id)?.status ?? 'absent'}</Badge> : <Select disabled={saving} value={displayStatus(student.id)} onChange={(event) => onStatusChange(student.id, event.target.value as FacultyDraftStatus)}>{facultyStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</Select> }]} /></div><div className="mt-4 grid gap-3 md:hidden">{filtered.length ? filtered.map((student) => { const record = records.find((row) => row.student_id === student.id); return <article key={student.id} className="rounded-lg border border-border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-text">{student.full_name}</p><p className="text-xs text-muted">{student.employee_or_register_number ?? '-'}</p></div><Badge tone={tone(record?.status ?? 'pending')}>{record?.status ?? 'pending'}</Badge></div><div className="mt-3">{locked ? <Badge tone={tone(record?.status ?? 'absent')}>{record?.status ?? 'absent'}</Badge> : <Select disabled={saving} value={displayStatus(student.id)} onChange={(event) => onStatusChange(student.id, event.target.value as FacultyDraftStatus)}>{facultyStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</Select>}</div></article> }) : <EmptyState title="No students match the search" />}</div>{!locked && <div className="mt-5 flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={saving || !hasUnsavedChanges} onClick={() => void onSaveChanges()}>Save changes</Button><Button disabled={saving || hasUnsavedChanges} onClick={() => onFinalize(session)}><LockKeyhole className="size-4" /> Review and finalize</Button></div>}</>}</Card>
}

function StaffAttendanceView(props: ViewProps) {
  return <div className="space-y-6"><PageHeader title="Staff attendance" description="Record your daily staff check-in and check-out." /><StaffSelfCard {...props} /></div>
}

function StaffSelfCard({ data, reload, userId }: ViewProps) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const record = data.staffAttendance.find((row) => row.profile_id === userId && row.attendance_date === today())
  const act = async (action: 'in' | 'out') => { setSaving(true); setMessage(''); try { if (action === 'in') await attendanceRepository.checkInStaff(); else if (record) await attendanceRepository.checkOutStaff(record.id); await reload(); setMessage(`Staff check-${action} recorded.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update staff attendance.') } finally { setSaving(false) } }
  return <Card><h2 className="font-bold text-text">My staff attendance</h2>{message && <p className="mt-2 text-sm text-muted">{message}</p>}<div className="mt-4 flex flex-wrap items-center gap-3">{record ? <><Badge tone={tone(record.status)}>{record.status}</Badge><span className="text-sm text-muted">In: {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '—'} · Out: {record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '—'}</span>{!record.check_out_time && <Button disabled={saving} onClick={() => void act('out')}>Check out</Button>}</> : <Button disabled={saving} onClick={() => void act('in')}>Check in</Button>}</div></Card>
}

function DepartmentAttendance({ data, reload, userId }: ViewProps) {
  const currentProfile = data.profiles.find((profile) => profile.id === userId)
  const departmentId = currentProfile?.role === 'super_admin' ? 'all' : currentProfile?.department_id ?? 'all'
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState(today())
  const [yearId, setYearId] = useState('all')
  const [sectionId, setSectionId] = useState('all')
  const [subjectId, setSubjectId] = useState('all')
  const [facultyId, setFacultyId] = useState('all')
  const [studentId, setStudentId] = useState('all')
  const departmentSections = data.sections.filter((section) => departmentId === 'all' || section.department_id === departmentId)
  const filteredSections = departmentSections.filter((section) => yearId === 'all' || section.academic_year_id === yearId)
  const filteredSectionIds = new Set(filteredSections.map((section) => section.id))
  const inDateRange = (value: string) => (!fromDate || value >= fromDate) && (!toDate || value <= toDate)
  const finalizedSessions = data.sessions.filter((session) => finalizedSessionStatuses.has(session.status) && session.subject_id && session.session_type !== 'daily' && inDateRange(session.attendance_date) && filteredSectionIds.has(session.section_id) && (sectionId === 'all' || session.section_id === sectionId) && (subjectId === 'all' || session.subject_id === subjectId) && (facultyId === 'all' || session.faculty_id === facultyId))
  const visibleSectionIds = new Set(finalizedSessions.map((session) => session.section_id))
  const activeStudents = data.enrollments.filter((enrollment) => enrollment.status === 'active' && filteredSectionIds.has(enrollment.section_id) && visibleSectionIds.has(enrollment.section_id) && (sectionId === 'all' || enrollment.section_id === sectionId) && (studentId === 'all' || enrollment.student_id === studentId)).map((enrollment) => data.profiles.find((profile) => profile.id === enrollment.student_id)).filter((profile): profile is AttendanceData['profiles'][number] => Boolean(profile && profile.role === 'student' && profile.status === 'active'))
  const rows = buildDepartmentAttendanceRows(data, finalizedSessions, activeStudents)
  const sessionIds = new Set(finalizedSessions.map((row) => row.id))
  const records = data.records.filter((row) => sessionIds.has(row.session_id))
  const shortageCount = rows.filter((row) => row.shortage).length
  const average = rows.length ? rows.reduce((sum, row) => sum + (row.percentage ?? 0), 0) / rows.filter((row) => row.percentage !== null).length : null
  const subjects = data.subjects.filter((subject) => departmentId === 'all' || subject.department_id === departmentId)
  const faculty = data.profiles.filter((profile) => (profile.role === 'faculty' || profile.role === 'hod') && (departmentId === 'all' || profile.department_id === departmentId))
  const corrections = data.corrections.filter((correction) => activeStudents.some((student) => student.id === correction.student_id))
  return <div className="space-y-6"><PageHeader title="Department attendance" description="Department, year, section, subject, faculty, and student attendance from finalized Supabase records." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} /><Card><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><label className="text-xs font-semibold text-muted">From<Input className="mt-1" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="text-xs font-semibold text-muted">To<Input className="mt-1" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><label className="text-xs font-semibold text-muted">Year<Select className="mt-1" value={yearId} onChange={(event) => { setYearId(event.target.value); setSectionId('all') }}><option value="all">All years</option>{data.academicYears.filter((year) => departmentId === 'all' || year.department_id === departmentId).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></label><label className="text-xs font-semibold text-muted">Section<Select className="mt-1" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="all">All sections</option>{filteredSections.map((section) => <option key={section.id} value={section.id}>Year {section.year_number} · {section.name}</option>)}</Select></label><label className="text-xs font-semibold text-muted">Subject<Select className="mt-1" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="all">All subjects</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>)}</Select></label><label className="text-xs font-semibold text-muted">Faculty<Select className="mt-1" value={facultyId} onChange={(event) => setFacultyId(event.target.value)}><option value="all">All faculty</option>{faculty.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</Select></label></div><label className="mt-3 block max-w-md text-xs font-semibold text-muted">Student<Select className="mt-1" value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="all">All students</option>{data.profiles.filter((profile) => profile.role === 'student' && profile.status === 'active' && data.enrollments.some((enrollment) => enrollment.student_id === profile.id && enrollment.status === 'active' && filteredSectionIds.has(enrollment.section_id))).map((profile) => <option key={profile.id} value={profile.id}>{profile.employee_or_register_number ?? 'No ID'} · {profile.full_name}</option>)}</Select></label>{toDate && fromDate && toDate < fromDate && <p className="mt-3 text-sm text-error">Date range end cannot be before start.</p>}</Card><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Finalized sessions" value={finalizedSessions.length} /><Metric label="Student records" value={records.length} /><Metric label="Average attendance" value={average === null || Number.isNaN(average) ? '—' : formatPercent(average)} /><Metric label="Shortage students" value={shortageCount} /><Metric label="Pending corrections" value={corrections.filter((row) => row.status === 'pending').length} /></div><Card><h2 className="font-bold text-text">Student attendance totals</h2><div className="mt-4"><DataTable rows={rows} empty={<EmptyState title="No finalized attendance matches these filters" />} columns={[{ header: 'Student', render: (row) => <div><p className="font-semibold">{row.student}</p><p className="text-xs text-muted">{row.registerNumber || 'No register number'}</p></div> }, { header: 'Year / section', render: (row) => <div><p>{row.year}</p><p className="text-xs text-muted">{row.section}</p></div> }, { header: 'Subject / faculty', render: (row) => <div><p>{row.subject}</p><p className="text-xs text-muted">{row.faculty}</p></div> }, { header: 'Conducted', render: (row) => row.conducted }, { header: 'Attended', render: (row) => row.present + row.late + row.excused }, { header: 'Absent', render: (row) => row.absent }, { header: 'OD/Leave', render: (row) => row.excused }, { header: 'Percentage', render: (row) => formatPercent(row.percentage) }, { header: 'Shortage', render: (row) => row.percentage === null ? <Badge>Not started</Badge> : row.shortage ? <Badge tone="warning">Shortage</Badge> : <Badge tone="success">Clear</Badge> }]} /></div></Card><Card><h2 className="font-bold text-text">Finalized sessions</h2><div className="mt-4"><DataTable rows={finalizedSessions} empty={<EmptyState title="No finalized sessions match these filters" />} columns={[{ header: 'Date', render: (session) => displayDate(session.attendance_date) }, { header: 'Year / section', render: (session) => sectionNameForAttendance(data, session.section_id) }, { header: 'Subject', render: (session) => data.subjects.find((row) => row.id === session.subject_id)?.name ?? 'Subject' }, { header: 'Faculty', render: (session) => data.profiles.find((row) => row.id === session.faculty_id)?.full_name ?? 'Faculty unavailable' }, { header: 'Status', render: (session) => <Badge tone={tone(session.status)}>{session.status}</Badge> }, { header: 'Records', render: (session) => data.records.filter((record) => record.session_id === session.id).length }]} /></div></Card><CorrectionReviewCard data={{ ...data, corrections }} reload={reload} /><StaffSelfCard data={data} reload={reload} userId={userId} /></div>
}

function buildDepartmentAttendanceRows(data: AttendanceData, sessions: AttendanceSessionRow[], students: AttendanceData['profiles']): DepartmentStudentAttendanceRow[] {
  const approvedRequests = data.requests.filter((request) => approvedRequestStatuses.has(request.status) && (request.request_type === 'od' || request.request_type === 'student_leave'))
  return students.flatMap((student) => {
    const enrollment = data.enrollments.find((row) => row.student_id === student.id && row.status === 'active')
    if (!enrollment) return []
    const sectionSessions = sessions.filter((session) => session.section_id === enrollment.section_id)
    const grouped = new Map<string, AttendanceSessionRow[]>()
    for (const session of sectionSessions) grouped.set(session.subject_id!, [...(grouped.get(session.subject_id!) ?? []), session])
    return [...grouped.entries()].map(([subjectId, subjectSessions]) => {
      const subject = data.subjects.find((row) => row.id === subjectId)
      const faculty = data.profiles.find((profile) => profile.id === subjectSessions[0]?.faculty_id)
      const section = data.sections.find((row) => row.id === enrollment.section_id)
      const year = data.academicYears.find((row) => row.id === enrollment.academic_year_id || row.id === section?.academic_year_id)
      let present = 0; let late = 0; let absent = 0; let excused = 0
      for (const session of subjectSessions) {
        const record = data.records.find((row) => row.session_id === session.id && row.student_id === student.id)
        const request = approvedRequests.find((row) => row.requester_id === student.id && row.from_date && row.to_date && row.from_date <= session.attendance_date && row.to_date >= session.attendance_date)
        if (record?.status === 'present') present += 1
        else if (record?.status === 'late') late += 1
        else if (request && (!record || record.status === 'absent')) excused += 1
        else absent += 1
      }
      const percentValue = percentage(present + late + excused, subjectSessions.length)
      return { id: `${student.id}-${subjectId}`, registerNumber: student.employee_or_register_number ?? '', student: student.full_name, year: year?.name ?? 'Academic year unavailable', section: section ? `Year ${section.year_number} · ${section.name}` : 'Section unavailable', subject: subject ? `${subject.code} · ${subject.name}` : 'Subject unavailable', faculty: faculty?.full_name ?? 'Faculty unavailable', conducted: subjectSessions.length, present, late, absent, excused, percentage: percentValue, shortage: percentValue !== null && percentValue < requiredAttendancePercent }
    })
  }).sort((first, second) => `${first.year}-${first.section}-${first.student}-${first.subject}`.localeCompare(`${second.year}-${second.section}-${second.student}-${second.subject}`))
}

function sectionNameForAttendance(data: AttendanceData, sectionId: string) {
  const section = data.sections.find((row) => row.id === sectionId)
  return section ? `Year ${section.year_number} · ${section.name}` : 'Section unavailable'
}

export function StaffManagementCard({ data, date, reload }: { data: AttendanceData; date: string; reload: () => Promise<void> }) {
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const rows = data.staffAttendance.filter((row) => row.attendance_date === date)
  const update = async (id: string, status: AttendanceStatus) => { setSavingId(id); setMessage(''); try { await attendanceRepository.updateStaffAttendance(id, status); await reload(); setMessage('Staff attendance updated.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update staff attendance.') } finally { setSavingId(null) } }
  return <Card><h2 className="font-bold text-text">Staff attendance</h2>{message && <p className="mt-2 text-sm text-muted">{message}</p>}<div className="mt-4"><DataTable rows={rows} empty={<EmptyState title="No staff attendance for this date" />} columns={[{ header: 'Staff', render: (row) => data.profiles.find((profile) => profile.id === row.profile_id)?.full_name ?? '—' }, { header: 'Check-in / out', render: (row) => `${row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString() : '—'} / ${row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString() : '—'}` }, { header: 'Status', render: (row) => <Select disabled={savingId === row.id} value={row.status} onChange={(event) => void update(row.id, event.target.value as AttendanceStatus)}>{statuses.map((status) => <option key={status}>{status}</option>)}</Select> }]} /></div></Card>
}

function CorrectionReviewCard({ data, reload }: { data: AttendanceData; reload: () => Promise<void> }) {
  const [review, setReview] = useState<AttendanceCorrectionRow | null>(null)
  const [approve, setApprove] = useState(true)
  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const pending = data.corrections.filter((row) => row.status === 'pending')
  const submit = async () => { if (!review) return; setSaving(true); setMessage(''); try { await attendanceRepository.reviewCorrection(review.id, approve, comments); await reload(); setReview(null); setComments(''); setMessage(`Correction ${approve ? 'approved' : 'rejected'}.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to review correction.') } finally { setSaving(false) } }
  return <Card><h2 className="font-bold text-text">Attendance corrections</h2>{message && <p className="mt-2 text-sm text-muted">{message}</p>}<div className="mt-4"><DataTable rows={pending} empty={<EmptyState title="No pending attendance corrections" />} columns={[{ header: 'Student', render: (row) => data.profiles.find((profile) => profile.id === row.student_id)?.full_name ?? '—' }, { header: 'Requested change', render: (row) => `${row.original_status} → ${row.requested_status}` }, { header: 'Reason', render: (row) => row.reason }, { header: 'Action', render: (row) => <Button onClick={() => setReview(row)}>Review</Button> }]} /></div><Modal isOpen={Boolean(review)} title="Review attendance correction" onClose={() => setReview(null)}>{review && <div className="space-y-4"><p className="text-sm text-muted">{review.original_status} → {review.requested_status}</p><p className="text-sm text-text">{review.reason}</p><Select value={approve ? 'approve' : 'reject'} onChange={(event) => setApprove(event.target.value === 'approve')}><option value="approve">Approve correction</option><option value="reject">Reject correction</option></Select><Textarea placeholder="Reviewer comments (optional)" value={comments} onChange={(event) => setComments(event.target.value)} /><div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setReview(null)}>Cancel</Button><Button variant={approve ? 'primary' : 'danger'} disabled={saving} onClick={() => void submit()}>{saving ? 'Submitting…' : approve ? 'Approve' : 'Reject'}</Button></div></div>}</Modal></Card>
}

function StudentCorrectionRequestDialog({ row, requestedStatus, setRequestedStatus, reason, setReason, proofFile, setProofFile, proofError, setProofError, saving, onClose, onSubmit }: { row: StudentHistoryRow | null; requestedStatus: AttendanceStatus; setRequestedStatus: (status: AttendanceStatus) => void; reason: string; setReason: (value: string) => void; proofFile: File | null; setProofFile: (file: File | null) => void; proofError: string; setProofError: (message: string) => void; saving: boolean; onClose: () => void; onSubmit: () => Promise<void> }) {
  const record = row?.record ?? null
  return <Modal isOpen={Boolean(record)} title="Request attendance correction" onClose={onClose}>{record && <div className="space-y-4"><div className="rounded-lg border border-border bg-background p-3"><p className="text-sm font-semibold text-text">{row?.subject ?? 'Attendance record'}</p><p className="mt-1 text-sm text-muted">{row ? `${displayDate(row.date)} - ${row.period} - ${row.faculty}` : `Current status: ${statusLabel(record.status)}`}</p></div><label className="block text-sm font-semibold">Requested status<Select className="mt-1" value={requestedStatus} onChange={(event) => setRequestedStatus(event.target.value as AttendanceStatus)}>{statuses.filter((status) => status !== record.status).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</Select></label><label className="block text-sm font-semibold">Reason<Textarea className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this attendance record needs correction." /></label><PrivateFileInput label="Supporting proof" file={proofFile} onFile={setProofFile} onError={setProofError} disabled={saving} />{proofError && <p role="alert" className="text-sm text-error">{proofError}</p>}<p className="text-xs text-warning">Proof files are validated with private-file rules, but this backend does not yet expose an attendance-correction attachment entity.</p><div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || Boolean(proofError)} onClick={() => void onSubmit()}>{saving ? 'Submitting...' : 'Submit correction'}</Button></div></div>}</Modal>
}


function Metric({ label, value }: { label: string; value: number | string }) {
  return <Card><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-text">{value}</p></Card>
}

function Feedback({ message }: { message: string }) {
  const success = /submitted|opened|saved|finalized|recorded|marked/i.test(message)
  return success ? <Card><p className="text-sm font-medium text-success">{message}</p></Card> : <ErrorState title="Attendance needs attention" description={message} />
}

interface ViewProps { data: AttendanceData; reload: () => Promise<void>; userId: string }
