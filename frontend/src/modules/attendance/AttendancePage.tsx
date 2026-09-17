import { ArrowLeft, CalendarDays, CheckCheck, LockKeyhole, RefreshCw, UserCheck, UserX } from 'lucide-react'
import { useCallback, useState } from 'react'

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
import { shiftToWeekday, toIsoDate, weekdayOf } from '@/lib/date-time'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import {
  attendanceRepository,
  type AttendanceCorrectionRow,
  type AttendanceData,
  type AttendanceRecordRow,
  type AttendanceSessionRow,
  type AttendanceSheetEntry,
  type AttendanceStatus,
  type StaffAttendanceRow,
} from '@/services/supabase/attendanceRepository'

const statuses: AttendanceStatus[] = ['present', 'late', 'absent']
const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const today = () => toIsoDate()
const tone = (status: string): 'success' | 'warning' | 'primary' | 'muted' => status === 'present' || status === 'finalized' ? 'success' : status === 'late' || status === 'open' || status === 'pending' ? 'warning' : status === 'absent' || status === 'rejected' ? 'muted' : 'primary'
const readable = (value: string) => value.replaceAll('_', ' ')

export function AttendancePage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => attendanceRepository.loadAttendanceData(), [])
  const resource = useAsyncResource(load, 'attendanceData')
  // Only the first load blanks the page.  Background refreshes keep the tree mounted so an
  // in-progress attendance sheet is never thrown away.
  if (resource.isLoading && !resource.data) return <LoadingState label="Loading attendance…" />
  if (resource.error) return <div className="space-y-4"><ErrorState title="Unable to load attendance" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  if (!currentUser || !resource.data) return null
  const common = { data: resource.data, reload: resource.reload, userId: currentUser.id }
  if (currentUser.role === 'student') return <StudentAttendance {...common} studentName={currentUser.name} />
  if (currentUser.role === 'faculty') return <FacultyAttendance {...common} />
  if (currentUser.role === 'hod' || currentUser.role === 'super_admin') return <DepartmentAttendance {...common} canManage={currentUser.role === 'super_admin'} />
  return <StaffAttendanceView {...common} />
}

interface StudentEntry { id: string; record: AttendanceRecordRow; session: AttendanceSessionRow }
interface AttendanceSummary { total: number; present: number; late: number; absent: number; percentage: number | null }

const DAILY_KEY = 'daily'
const summarizeRecords = (records: AttendanceRecordRow[]): AttendanceSummary => {
  const count = (status: AttendanceStatus) => records.filter((record) => record.status === status).length
  const present = count('present'), late = count('late'), absent = count('absent')
  // Late arrivals still attended the class, so they count towards the percentage.
  return { total: records.length, present, late, absent, percentage: records.length ? Math.round(((present + late) / records.length) * 100) : null }
}
const summarize = (entries: StudentEntry[]) => summarizeRecords(entries.map((entry) => entry.record))
const monthLabel = (value: string) => { const [year, month] = value.split('-').map(Number); return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }

function StudentAttendance({ data, reload, userId, studentName }: ViewProps & { studentName: string }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [correctionRecord, setCorrectionRecord] = useState<AttendanceRecordRow | null>(null)
  const [requestedStatus, setRequestedStatus] = useState<AttendanceStatus>('present')
  const [reason, setReason] = useState('')
  const [scope, setScope] = useState<'overall' | 'monthly'>('overall')
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [subjectFilter, setSubjectFilter] = useState('all')

  const pendingCorrectionIds = new Set(data.corrections.filter((row) => row.status === 'pending').map((row) => row.attendance_record_id))
  const subjectName = (id: string | null) => data.subjects.find((row) => row.id === id)?.name ?? 'Daily attendance'
  const subjectCode = (id: string | null) => data.subjects.find((row) => row.id === id)?.code ?? null
  const keyOf = (session: AttendanceSessionRow) => session.subject_id ?? DAILY_KEY

  const entries: StudentEntry[] = data.records
    .filter((record) => record.student_id === userId)
    .map((record) => ({ id: record.id, record, session: data.sessions.find((row) => row.id === record.session_id) }))
    .filter((entry): entry is StudentEntry => Boolean(entry.session))
    .sort((a, b) => b.session.attendance_date.localeCompare(a.session.attendance_date))
  const scoped = scope === 'overall' ? entries : entries.filter((entry) => entry.session.attendance_date.startsWith(month))
  const filtered = subjectFilter === 'all' ? scoped : scoped.filter((entry) => keyOf(entry.session) === subjectFilter)
  const summary = summarize(filtered)
  const scopeLabel = scope === 'overall' ? 'All time' : monthLabel(month)

  const subjectKeys = [...new Set(entries.map((entry) => keyOf(entry.session)))]
  const subjectRows = subjectKeys.map((key) => ({ id: key, label: key === DAILY_KEY ? 'Daily attendance' : subjectName(key), code: key === DAILY_KEY ? null : subjectCode(key), ...summarize(scoped.filter((entry) => keyOf(entry.session) === key)) }))
  const monthKeys = [...new Set(entries.map((entry) => entry.session.attendance_date.slice(0, 7)))].sort((a, b) => b.localeCompare(a))
  const monthRows = monthKeys.map((key) => ({ id: key, ...summarize(entries.filter((entry) => entry.session.attendance_date.startsWith(key) && (subjectFilter === 'all' || keyOf(entry.session) === subjectFilter))) }))

  const requestCorrection = async () => {
    if (!correctionRecord) return
    setSaving(true); setMessage('')
    try { await attendanceRepository.requestCorrection(correctionRecord, requestedStatus, reason); await reload(); setCorrectionRecord(null); setReason(''); setMessage('Attendance correction submitted.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to request correction.') } finally { setSaving(false) }
  }

  return <div className="space-y-6">
    <PageHeader title={`${studentName} attendance`} description="Your recorded attendance, by subject and by month. Entries are marked by your Faculty." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    {message && <Feedback message={message} />}
    {entries.length === 0
      ? <Card><EmptyState title="No attendance records yet" description="Your attendance appears here once your Faculty submits a session." /></Card>
      : <>
        <Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold text-text">View
              <Select className="mt-1" value={scope} onChange={(event) => setScope(event.target.value as 'overall' | 'monthly')}><option value="overall">Overall</option><option value="monthly">Month by month</option></Select>
            </label>
            <label className="text-sm font-semibold text-text">Month
              <Select className="mt-1" disabled={scope === 'overall'} value={month} onChange={(event) => setMonth(event.target.value)}>{monthKeys.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}</Select>
            </label>
            <label className="text-sm font-semibold text-text">Subject
              <Select className="mt-1" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{subjectKeys.map((key) => <option key={key} value={key}>{key === DAILY_KEY ? 'Daily attendance' : `${subjectCode(key) ?? ''} · ${subjectName(key)}`.trim()}</option>)}</Select>
            </label>
          </div>
        </Card>
        <section>
          <h2 className="mb-3 font-bold text-text">{scopeLabel}{subjectFilter === 'all' ? '' : ` · ${subjectFilter === DAILY_KEY ? 'Daily attendance' : subjectName(subjectFilter)}`}</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <StatTile label="Total classes" value={summary.total} />
            <StatTile label="Present" value={summary.present} accent="text-success" />
            <StatTile label="Late" value={summary.late} accent="text-warning" />
            <StatTile label="Absent" value={summary.absent} accent="text-error" />
            <StatTile label="Attendance" value={summary.percentage === null ? '—' : `${summary.percentage}%`} accent={summary.percentage !== null && summary.percentage < 75 ? 'text-error' : 'text-success'} />
          </div>
          <PercentageBar percentage={summary.percentage} />
        </section>
        <Card>
          <h2 className="font-bold text-text">Subject-wise attendance</h2>
          <p className="mt-1 text-sm text-muted">{scopeLabel}. Select a row to filter the history below.</p>
          <div className="mt-4"><DataTable rows={subjectRows} empty={<EmptyState title="No records in this period" />} columns={[
            { header: 'Subject', render: (row) => <div><p className="font-semibold">{row.label}</p>{row.code && <p className="text-xs text-muted">{row.code}</p>}</div> },
            { header: 'Total', render: (row) => row.total },
            { header: 'Present', render: (row) => row.present + row.late },
            { header: 'Absent', render: (row) => row.absent },
            { header: 'Attendance', render: (row) => row.percentage === null ? '—' : <Badge tone={row.percentage < 75 ? 'warning' : 'success'}>{row.percentage}%</Badge> },
            { header: 'View', render: (row) => <Button className="min-h-8 px-3" variant={subjectFilter === row.id ? 'primary' : 'secondary'} onClick={() => setSubjectFilter(subjectFilter === row.id ? 'all' : row.id)}>{subjectFilter === row.id ? 'Showing' : 'Show'}</Button> },
          ]} /></div>
        </Card>
        <Card>
          <h2 className="font-bold text-text">Month-by-month attendance</h2>
          <p className="mt-1 text-sm text-muted">{subjectFilter === 'all' ? 'All subjects' : subjectFilter === DAILY_KEY ? 'Daily attendance' : subjectName(subjectFilter)}.</p>
          <div className="mt-4"><DataTable rows={monthRows} empty={<EmptyState title="No records yet" />} columns={[
            { header: 'Month', render: (row) => <span className="font-semibold">{monthLabel(row.id)}</span> },
            { header: 'Total', render: (row) => row.total },
            { header: 'Present', render: (row) => row.present + row.late },
            { header: 'Absent', render: (row) => row.absent },
            { header: 'Attendance', render: (row) => row.percentage === null ? '—' : <Badge tone={row.percentage < 75 ? 'warning' : 'success'}>{row.percentage}%</Badge> },
            { header: 'View', render: (row) => <Button className="min-h-8 px-3" variant={scope === 'monthly' && month === row.id ? 'primary' : 'secondary'} onClick={() => { setScope('monthly'); setMonth(row.id) }}>{scope === 'monthly' && month === row.id ? 'Showing' : 'Show'}</Button> },
          ]} /></div>
        </Card>
        <Card>
          <h2 className="font-bold text-text">Attendance history</h2>
          <p className="mt-1 text-sm text-muted">{filtered.length} record{filtered.length === 1 ? '' : 's'} · {scopeLabel}</p>
          <div className="mt-4"><DataTable rows={filtered} empty={<EmptyState title="No records match these filters" />} columns={[
            { header: 'Date', render: (entry) => <div><p className="font-semibold">{entry.session.attendance_date}</p><p className="text-xs text-muted">{entry.session.period ? `Period ${entry.session.period}` : readable(entry.session.session_type)}</p></div> },
            { header: 'Subject', render: (entry) => <div><p>{subjectName(entry.session.subject_id)}</p>{subjectCode(entry.session.subject_id) && <p className="text-xs text-muted">{subjectCode(entry.session.subject_id)}</p>}</div> },
            { header: 'Status', render: (entry) => <Badge tone={tone(entry.record.status)}>{entry.record.status}</Badge> },
            { header: 'Session', render: (entry) => <Badge tone={tone(entry.session.status)}>{entry.session.status}</Badge> },
            { header: 'Correction', render: (entry) => pendingCorrectionIds.has(entry.record.id) ? <Badge tone="warning">Pending</Badge> : <Button className="min-h-8 px-3" variant="secondary" onClick={() => { setCorrectionRecord(entry.record); setRequestedStatus(entry.record.status === 'present' ? 'late' : 'present') }}>Request</Button> },
          ]} /></div>
        </Card>
      </>}
    <CorrectionRequestDialog record={correctionRecord} requestedStatus={requestedStatus} setRequestedStatus={setRequestedStatus} reason={reason} setReason={setReason} saving={saving} onClose={() => setCorrectionRecord(null)} onSubmit={requestCorrection} />
  </div>
}

function StatTile({ label, value, accent = 'text-text' }: { label: string; value: number | string; accent?: string }) {
  return <Card className="p-3 sm:p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className={`mt-1 text-2xl font-bold sm:text-3xl ${accent}`}>{value}</p></Card>
}

function PercentageBar({ percentage }: { percentage: number | null }) {
  if (percentage === null) return null
  return <div className="mt-3">
    <div className="h-2 w-full overflow-hidden rounded-full bg-border"><div className={`h-full rounded-full ${percentage < 75 ? 'bg-error' : 'bg-success'}`} style={{ width: `${percentage}%` }} /></div>
    <p className="mt-2 text-xs text-muted">{percentage < 75 ? 'Below the 75% requirement.' : 'Meets the 75% requirement.'} Present and late classes both count as attended.</p>
  </div>
}

function FacultyAttendance({ data, reload, userId }: ViewProps) {
  const [date, setDate] = useState(today())
  const [showAllDays, setShowAllDays] = useState(false)
  const [openedSession, setOpenedSession] = useState<AttendanceSessionRow | null>(null)
  const [starting, setStarting] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [finalizeSession, setFinalizeSession] = useState<AttendanceSessionRow | null>(null)

  const assignments = data.assignments.filter((row) => row.faculty_id === userId && row.is_active)
  const assignedSectionIds = new Set(assignments.map((row) => row.section_id))
  const periods = data.timetable.filter((entry) => assignedSectionIds.has(entry.section_id) && assignments.some((assignment) => assignment.section_id === entry.section_id && (assignment.subject_id === entry.subject_id || assignment.assignment_type === 'class_teacher')))
  const classTeacherSections = data.sections.filter((section) => assignments.some((assignment) => assignment.section_id === section.id && assignment.assignment_type === 'class_teacher'))
  const activeStudents = (sectionId: string) => data.enrollments.filter((row) => row.section_id === sectionId && row.status === 'active').map((row) => data.profiles.find((profile) => profile.id === row.student_id)).filter((row): row is NonNullable<typeof row> => Boolean(row && row.status === 'active'))
  const sectionName = (sectionId: string) => data.sections.find((row) => row.id === sectionId)?.name ?? '—'
  const subjectName = (subjectId: string | null) => data.subjects.find((row) => row.id === subjectId)?.name ?? 'Subject attendance'
  const sessionFor = (entryId: string) => data.sessions.find((row) => row.timetable_entry_id === entryId && row.attendance_date === date)
  const dailySessionFor = (sectionId: string) => data.sessions.find((row) => row.session_type === 'daily' && row.section_id === sectionId && row.attendance_date === date)
  // Reloads replace the row object, so always prefer the freshest copy of the opened session.
  const activeSession = openedSession ? data.sessions.find((row) => row.id === openedSession.id) ?? openedSession : null

  const enterSheet = async (key: string, open: () => Promise<AttendanceSessionRow>) => {
    setStarting(key); setMessage('')
    try { setOpenedSession(await open()); void reload() } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to open attendance.') } finally { setStarting('') }
  }
  const submitSheet = async (entries: AttendanceSheetEntry[]) => {
    if (!activeSession) return
    setSaving(true); setMessage('')
    try { await attendanceRepository.submitAttendanceSheet(activeSession, entries); await reload(); setMessage(`Attendance submitted for ${entries.length} student${entries.length === 1 ? '' : 's'}.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to submit attendance.') } finally { setSaving(false) }
  }
  const finalize = async () => {
    if (!finalizeSession) return
    const students = activeStudents(finalizeSession.section_id)
    const count = data.records.filter((record) => record.session_id === finalizeSession.id).length
    if (count < students.length) { setMessage('Submit attendance for every active enrolled student before finalizing.'); setFinalizeSession(null); return }
    setSaving(true)
    try { await attendanceRepository.finalizeSession(finalizeSession.id); await reload(); setFinalizeSession(null); setMessage('Attendance finalized and locked.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to finalize attendance.') } finally { setSaving(false) }
  }
  const finalizeDialog = <ConfirmDialog isOpen={Boolean(finalizeSession)} title="Finalize attendance?" description="Finalization permanently locks direct edits. Later changes require an approved correction." confirmLabel="Finalize and lock" onCancel={() => setFinalizeSession(null)} onConfirm={() => void finalize()} />

  if (activeSession) {
    const entry = activeSession.timetable_entry_id ? periods.find((row) => row.id === activeSession.timetable_entry_id) : undefined
    const heading = activeSession.session_type === 'daily' ? 'Daily check-in attendance' : subjectName(activeSession.subject_id)
    const context = [sectionName(activeSession.section_id), activeSession.period ? `Period ${activeSession.period}` : null, entry ? `${entry.starts_at}–${entry.ends_at}` : null, entry?.room, date].filter(Boolean).join(' · ')
    return <div className="space-y-6">
      <PageHeader title={heading} description={context} actions={<Button variant="secondary" onClick={() => { setOpenedSession(null); setMessage('') }}><ArrowLeft className="size-4" /> Back to periods</Button>} />
      {message && <Feedback message={message} />}
      <AttendanceSheet key={activeSession.id} session={activeSession} students={activeStudents(activeSession.section_id)} records={data.records.filter((row) => row.session_id === activeSession.id)} saving={saving} onSubmit={submitSheet} onFinalize={() => setFinalizeSession(activeSession)} />
      {finalizeDialog}
    </div>
  }

  const weekday = weekdayOf(date)
  const visiblePeriods = periods.filter((entry) => showAllDays || entry.day_of_week === weekday).sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period)
  return <div className="space-y-6">
    <PageHeader title="Faculty attendance" description="Pick a period to open its roster. Everything stays on one screen until you submit." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    {message && <Feedback message={message} />}
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="block text-sm font-semibold text-text">Attendance date<Input className="mt-1 max-w-xs" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <Button variant="secondary" onClick={() => setShowAllDays((current) => !current)}><CalendarDays className="size-4" /> {showAllDays ? `Only ${days[weekday]}` : 'Show every assigned period'}</Button>
      </div>
    </Card>
    <section>
      <h2 className="mb-3 font-bold text-text">{showAllDays ? 'All assigned periods' : `${days[weekday]} periods`}</h2>
      {visiblePeriods.length === 0
        ? <EmptyState title="No periods scheduled" description={showAllDays ? 'You have no assigned timetable periods yet.' : `Nothing is scheduled for you on ${days[weekday]}. Switch to every assigned period to backfill another day.`} />
        : <div className="grid gap-3 lg:grid-cols-2">{visiblePeriods.map((entry) => {
          const session = sessionFor(entry.id)
          const total = activeStudents(entry.section_id).length
          const marked = session ? data.records.filter((row) => row.session_id === session.id).length : 0
          // A period only exists on its own weekday; opening it against another date would
          // collide with that date's real period on (section, date, period, type).
          const offDay = entry.day_of_week !== weekday
          return <PeriodCard key={entry.id} title={subjectName(entry.subject_id)} meta={`${days[entry.day_of_week]} · P${entry.period} · ${entry.starts_at}–${entry.ends_at}`} detail={`${sectionName(entry.section_id)} · ${entry.room}${entry.lab ? ` · ${entry.lab}` : ''} · ${total} student${total === 1 ? '' : 's'}`} session={offDay ? undefined : session} marked={marked} total={total} busy={starting === entry.id} offDayLabel={offDay ? days[entry.day_of_week] : undefined} onOpen={() => offDay ? setDate(shiftToWeekday(date, entry.day_of_week)) : void enterSheet(entry.id, () => attendanceRepository.openSubjectSession(entry.id, date))} />
        })}</div>}
    </section>
    {classTeacherSections.length > 0 && <section>
      <h2 className="mb-3 font-bold text-text">Daily check-in (Class Teacher)</h2>
      <div className="grid gap-3 lg:grid-cols-2">{classTeacherSections.map((section) => {
        const session = dailySessionFor(section.id)
        const total = activeStudents(section.id).length
        const marked = session ? data.records.filter((row) => row.session_id === session.id).length : 0
        return <PeriodCard key={section.id} title={`${section.name} daily attendance`} meta={date} detail={`${total} enrolled student${total === 1 ? '' : 's'} · verifies student self check-ins`} session={session} marked={marked} total={total} busy={starting === section.id} onOpen={() => void enterSheet(section.id, () => attendanceRepository.openDailySession(section.id, date))} />
      })}</div>
    </section>}
    <CorrectionReviewCard data={data} reload={reload} />
    <StaffSelfCard data={data} reload={reload} userId={userId} />
    {finalizeDialog}
  </div>
}

function PeriodCard({ title, meta, detail, session, marked, total, busy, offDayLabel, onOpen }: { title: string; meta: string; detail: string; session?: AttendanceSessionRow; marked: number; total: number; busy: boolean; offDayLabel?: string; onOpen: () => void }) {
  const locked = session?.status === 'finalized' || session?.status === 'locked'
  const complete = Boolean(session) && total > 0 && marked >= total
  const state = offDayLabel ? 'Other day' : locked ? 'Finalized' : complete ? 'Submitted' : session ? 'In progress' : 'Not started'
  const label = offDayLabel ? `Go to ${offDayLabel}` : locked ? 'View attendance' : complete ? 'Edit attendance' : session ? 'Continue attendance' : 'Start attendance'
  return <Card className="flex flex-col gap-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{meta}</p>
        <h3 className="mt-1 font-bold text-text">{title}</h3>
        <p className="mt-1 text-sm text-muted">{detail}</p>
      </div>
      <Badge tone={offDayLabel ? 'muted' : locked ? 'success' : complete ? 'primary' : session ? 'warning' : 'muted'}>{state}</Badge>
    </div>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">{offDayLabel ? `Only recordable on a ${offDayLabel}` : session ? `${marked} of ${total} marked` : 'No session opened yet'}</p>
      <Button variant={offDayLabel ? 'secondary' : 'primary'} disabled={busy || total === 0} onClick={onOpen}>{busy ? 'Opening…' : label}</Button>
    </div>
  </Card>
}

/**
 * Holds the whole roster in local state.  Marking a student never touches the network, so the
 * page cannot reload underneath the user; the sheet reaches the database only on submit.
 */
function AttendanceSheet({ session, students, records, saving, onSubmit, onFinalize }: { session: AttendanceSessionRow; students: AttendanceData['profiles']; records: AttendanceRecordRow[]; saving: boolean; onSubmit: (entries: AttendanceSheetEntry[]) => Promise<void>; onFinalize: () => void }) {
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>(() => Object.fromEntries(students.map((student) => [student.id, records.find((row) => row.student_id === student.id)?.status ?? 'present'])))
  const [search, setSearch] = useState('')
  const locked = session.status === 'finalized' || session.status === 'locked'
  const statusOf = (studentId: string) => draft[studentId] ?? 'present'
  const setAll = (status: AttendanceStatus) => setDraft(Object.fromEntries(students.map((student) => [student.id, status])))
  const counts = { present: students.filter((student) => statusOf(student.id) === 'present').length, late: students.filter((student) => statusOf(student.id) === 'late').length, absent: students.filter((student) => statusOf(student.id) === 'absent').length }
  const term = search.trim().toLowerCase()
  const filtered = term ? students.filter((student) => `${student.full_name} ${student.employee_or_register_number ?? ''}`.toLowerCase().includes(term)) : students
  const unsaved = students.some((student) => records.find((row) => row.student_id === student.id)?.status !== statusOf(student.id))
  const submitted = students.length > 0 && records.length >= students.length

  if (!students.length) return <Card><EmptyState title="No active students in this section" description="Enroll active students before recording attendance." /></Card>
  return <Card className="pb-0">
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {(['present', 'late', 'absent'] as const).map((status) => <div key={status} className="rounded border border-border p-2 text-center sm:p-3"><p className="text-xs capitalize text-muted">{status}</p><p className="text-xl font-bold text-text sm:text-2xl">{counts[status]}</p></div>)}
    </div>
    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
      <Input placeholder="Search by name or register number" value={search} onChange={(event) => setSearch(event.target.value)} />
      {!locked && <div className="flex gap-2">
        <Button className="flex-1 px-3 sm:flex-none" variant="secondary" onClick={() => setAll('present')}><CheckCheck className="size-4" /> All present</Button>
        <Button className="flex-1 px-3 sm:flex-none" variant="secondary" onClick={() => setAll('absent')}><UserX className="size-4" /> All absent</Button>
      </div>}
    </div>
    <ul className="mt-2 divide-y divide-border">
      {filtered.map((student) => {
        const record = records.find((row) => row.student_id === student.id)
        return <li key={student.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold leading-5 text-text sm:text-base">{student.full_name}</p>
            <p className="text-xs text-muted">{student.employee_or_register_number ?? '—'}{record?.check_in_time ? ` · Checked in ${new Date(record.check_in_time).toLocaleTimeString()}` : ''}</p>
          </div>
          {locked
            ? <Badge tone={tone(statusOf(student.id))}>{statusOf(student.id)}</Badge>
            : <StatusToggle name={student.full_name} value={statusOf(student.id)} onChange={(status) => setDraft((current) => ({ ...current, [student.id]: status }))} />}
        </li>
      })}
      {filtered.length === 0 && <li className="py-6 text-center text-sm text-muted">No students match “{search}”.</li>}
    </ul>
    <div className="sticky bottom-0 -mx-4 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-b border-t border-border bg-surface px-4 py-3 sm:-mx-5 sm:px-5 sm:py-4">
      <p className="text-sm text-muted">{locked ? 'This session is finalized and read-only.' : unsaved ? 'Unsaved changes — nothing is recorded until you submit.' : submitted ? 'All students submitted.' : 'Review the roster, then submit.'}</p>
      {!locked && <div className="flex flex-wrap gap-3">
        {submitted && !unsaved && <Button variant="secondary" disabled={saving} onClick={onFinalize}><LockKeyhole className="size-4" /> Finalize and lock</Button>}
        <Button disabled={saving} onClick={() => void onSubmit(students.map((student) => ({ studentId: student.id, status: statusOf(student.id) })))}>{saving ? 'Submitting…' : 'Submit attendance'}</Button>
      </div>}
    </div>
  </Card>
}

const statusStyles: Record<AttendanceStatus, { active: string; inactive: string; label: string }> = {
  present: { active: 'border-success bg-success text-primary-foreground shadow-sm', inactive: 'text-success hover:bg-success/10', label: 'P' },
  late: { active: 'border-warning bg-warning text-primary-foreground shadow-sm', inactive: 'text-warning hover:bg-warning/10', label: 'L' },
  absent: { active: 'border-error bg-error text-primary-foreground shadow-sm', inactive: 'text-error hover:bg-error/10', label: 'A' },
}

function StatusToggle({ name, value, onChange }: { name: string; value: AttendanceStatus; onChange: (status: AttendanceStatus) => void }) {
  return <div role="group" aria-label={`Attendance status for ${name}`} className="inline-grid grid-cols-3 gap-1 rounded-full border border-border bg-background p-1">
    {statuses.map((status) => {
      const selected = value === status
      const style = statusStyles[status]
      return <button key={status} type="button" title={`${status} for ${name}`} aria-label={`Mark ${name} ${status}`} aria-pressed={selected} onClick={() => onChange(status)} className={`grid size-9 place-items-center rounded-full border text-xs font-black uppercase transition duration-150 active:scale-90 ${selected ? style.active : `border-transparent bg-surface ${style.inactive}`}`}>
        <span aria-hidden="true">{style.label}</span>
      </button>
    })}
  </div>
}

function StaffAttendanceView(props: ViewProps) {
  return <div className="space-y-6"><PageHeader title="Staff attendance" description="Record your daily staff check-in and check-out." /><StaffSelfCard {...props} /></div>
}

function StaffSelfCard({ data, reload, userId }: ViewProps) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const record = data.staffAttendance.find((row) => row.profile_id === userId && row.attendance_date === today())
  const act = async (action: 'in' | 'out') => { setSaving(true); setMessage(''); try { if (action === 'in') await attendanceRepository.checkInStaff(); else if (record) await attendanceRepository.checkOutStaff(record.id); await reload(); setMessage(`Staff check-${action} recorded.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update staff attendance.') } finally { setSaving(false) } }
  return <Card>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="font-bold text-text">My staff attendance</h2>
        <p className="mt-1 text-sm text-muted">{today()}{record ? ` · In ${record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '—'} · Out ${record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '—'}` : ' · Not checked in yet'}</p>
        {message && <p role="status" className="mt-2 text-sm text-muted">{message}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {record && <Badge tone={tone(record.status)}>{record.status}</Badge>}
        {!record && <Button disabled={saving} onClick={() => void act('in')}><UserCheck className="size-4" /> {saving ? 'Checking in…' : 'Check in'}</Button>}
        {record && !record.check_out_time && <Button disabled={saving} onClick={() => void act('out')}>{saving ? 'Checking out…' : 'Check out'}</Button>}
        {record?.check_out_time && <span className="text-sm text-muted">Completed for today.</span>}
      </div>
    </div>
  </Card>
}

/**
 * Department-wide view for HOD and Super Admin.  Defaults to every recorded date rather than a
 * single day, so "all attendance" is the starting point and narrowing is opt-in.
 */
function DepartmentAttendance({ data, reload, userId, canManage }: ViewProps & { canManage: boolean }) {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sectionId, setSectionId] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<AttendanceSessionRow | null>(null)

  const profileName = (id: string | null) => data.profiles.find((row) => row.id === id)?.full_name ?? '—'
  const sectionName = (id: string | null) => data.sections.find((row) => row.id === id)?.name ?? '—'
  const subjectName = (id: string | null) => data.subjects.find((row) => row.id === id)?.name ?? 'Daily attendance'
  const keyOf = (session: AttendanceSessionRow) => session.subject_id ?? DAILY_KEY
  const activeStudents = (id: string) => data.enrollments.filter((row) => row.section_id === id && row.status === 'active').map((row) => data.profiles.find((profile) => profile.id === row.student_id)).filter((row): row is NonNullable<typeof row> => Boolean(row))

  const inRange = (date: string) => (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
  const sessions = data.sessions
    .filter((row) => inRange(row.attendance_date) && (sectionId === 'all' || row.section_id === sectionId) && (subjectFilter === 'all' || keyOf(row) === subjectFilter))
    .sort((a, b) => b.attendance_date.localeCompare(a.attendance_date) || (b.period ?? 0) - (a.period ?? 0))
  const sessionIds = new Set(sessions.map((row) => row.id))
  const records = data.records.filter((row) => sessionIds.has(row.session_id))
  const summary = summarizeRecords(records)
  const openSessions = sessions.filter((row) => row.status !== 'finalized' && row.status !== 'locked')
  const staff = data.staffAttendance.filter((row) => inRange(row.attendance_date))
  const scopeLabel = !fromDate && !toDate ? 'All recorded attendance' : `${fromDate || 'start'} → ${toDate || 'today'}`

  const subjectKeys = [...new Set(data.sessions.map(keyOf))]
  const sectionRows = data.sections.map((section) => {
    const ids = new Set(sessions.filter((row) => row.section_id === section.id).map((row) => row.id))
    return { id: section.id, label: `Year ${section.year_number} · ${section.name}`, students: activeStudents(section.id).length, ...summarizeRecords(records.filter((row) => ids.has(row.session_id))) }
  })
  const subjectRows = subjectKeys.map((key) => {
    const ids = new Set(sessions.filter((row) => keyOf(row) === key).map((row) => row.id))
    return { id: key, label: key === DAILY_KEY ? 'Daily attendance' : subjectName(key), sessions: ids.size, ...summarizeRecords(records.filter((row) => ids.has(row.session_id))) }
  }).filter((row) => row.total > 0)
  const term = search.trim().toLowerCase()
  const studentRows = [...new Set(records.map((row) => row.student_id))]
    .map((id) => { const profile = data.profiles.find((row) => row.id === id); return { id, label: profile?.full_name ?? 'Unknown student', register: profile?.employee_or_register_number ?? '—', ...summarizeRecords(records.filter((row) => row.student_id === id)) } })
    .filter((row) => !term || `${row.label} ${row.register}`.toLowerCase().includes(term))
    .sort((a, b) => (a.percentage ?? 100) - (b.percentage ?? 100))

  const preset = (kind: 'all' | 'today' | 'month') => {
    if (kind === 'all') { setFromDate(''); setToDate('') }
    else if (kind === 'today') { setFromDate(today()); setToDate(today()) }
    else { setFromDate(`${today().slice(0, 7)}-01`); setToDate(today()) }
  }

  return <div className="space-y-6">
    <PageHeader title="Department attendance" description="Every attendance record visible to your role, across sections, subjects and students." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    {canManage && <StaffSelfCard data={data} reload={reload} userId={userId} />}
    <Card>
      <div className="grid gap-3 lg:grid-cols-4">
        <label className="text-sm font-semibold text-text">From<Input className="mt-1" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="text-sm font-semibold text-text">To<Input className="mt-1" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        <label className="text-sm font-semibold text-text">Section<Select className="mt-1" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="all">All sections</option>{data.sections.map((row) => <option key={row.id} value={row.id}>Year {row.year_number} · {row.name} · {activeStudents(row.id).length} student{activeStudents(row.id).length === 1 ? '' : 's'}</option>)}</Select></label>
        <label className="text-sm font-semibold text-text">Subject<Select className="mt-1" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{subjectKeys.map((key) => <option key={key} value={key}>{key === DAILY_KEY ? 'Daily attendance' : subjectName(key)}</option>)}</Select></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" className="min-h-8 px-3" onClick={() => preset('all')}><CalendarDays className="size-4" /> All time</Button>
        <Button variant="secondary" className="min-h-8 px-3" onClick={() => preset('month')}>This month</Button>
        <Button variant="secondary" className="min-h-8 px-3" onClick={() => preset('today')}>Today</Button>
      </div>
    </Card>

    <section>
      <h2 className="mb-3 font-bold text-text">{scopeLabel}</h2>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatTile label="Classes recorded" value={summary.total} />
        <StatTile label="Present" value={summary.present + summary.late} accent="text-success" />
        <StatTile label="Absent" value={summary.absent} accent="text-error" />
        <StatTile label="Attendance" value={summary.percentage === null ? '—' : `${summary.percentage}%`} accent={summary.percentage !== null && summary.percentage < 75 ? 'text-error' : 'text-success'} />
        <StatTile label="Sessions" value={sessions.length} accent={openSessions.length ? 'text-warning' : 'text-text'} />
      </div>
      <PercentageBar percentage={summary.percentage} />
      {openSessions.length > 0 && <p className="mt-2 text-sm text-warning">{openSessions.length} session{openSessions.length === 1 ? '' : 's'} still open or in draft — not yet finalized by Faculty.</p>}
    </section>

    {canManage && <ClassLockCard sections={data.sections} reload={reload} />}

    <Card>
      <h2 className="font-bold text-text">Section-wise attendance</h2>
      <div className="mt-4"><DataTable rows={sectionRows} empty={<EmptyState title="No sections" />} columns={[
        { header: 'Section', render: (row) => <div><p className="font-semibold">{row.label}</p><p className="text-xs text-muted">{row.students} active student{row.students === 1 ? '' : 's'}</p></div> },
        { header: 'Classes', render: (row) => row.total },
        { header: 'Present', render: (row) => row.present + row.late },
        { header: 'Absent', render: (row) => row.absent },
        { header: 'Attendance', render: (row) => row.percentage === null ? '—' : <Badge tone={row.percentage < 75 ? 'warning' : 'success'}>{row.percentage}%</Badge> },
        { header: 'View', render: (row) => <Button className="min-h-8 px-3" variant={sectionId === row.id ? 'primary' : 'secondary'} onClick={() => setSectionId(sectionId === row.id ? 'all' : row.id)}>{sectionId === row.id ? 'Showing' : 'Show'}</Button> },
      ]} /></div>
    </Card>

    <Card>
      <h2 className="font-bold text-text">Subject-wise attendance</h2>
      <div className="mt-4"><DataTable rows={subjectRows} empty={<EmptyState title="No attendance in this range" />} columns={[
        { header: 'Subject', render: (row) => <div><p className="font-semibold">{row.label}</p><p className="text-xs text-muted">{row.sessions} session{row.sessions === 1 ? '' : 's'}</p></div> },
        { header: 'Classes', render: (row) => row.total },
        { header: 'Present', render: (row) => row.present + row.late },
        { header: 'Absent', render: (row) => row.absent },
        { header: 'Attendance', render: (row) => row.percentage === null ? '—' : <Badge tone={row.percentage < 75 ? 'warning' : 'success'}>{row.percentage}%</Badge> },
        { header: 'View', render: (row) => <Button className="min-h-8 px-3" variant={subjectFilter === row.id ? 'primary' : 'secondary'} onClick={() => setSubjectFilter(subjectFilter === row.id ? 'all' : row.id)}>{subjectFilter === row.id ? 'Showing' : 'Show'}</Button> },
      ]} /></div>
    </Card>

    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-bold text-text">Student attendance</h2><p className="mt-1 text-sm text-muted">Lowest attendance first, so shortfalls surface immediately.</p></div>
        <Input className="max-w-xs" placeholder="Search name or register number" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="mt-4"><DataTable rows={studentRows} empty={<EmptyState title="No student records in this range" />} columns={[
        { header: 'Student', render: (row) => <div><p className="font-semibold">{row.label}</p><p className="text-xs text-muted">{row.register}</p></div> },
        { header: 'Classes', render: (row) => row.total },
        { header: 'Present', render: (row) => row.present + row.late },
        { header: 'Absent', render: (row) => row.absent },
        { header: 'Attendance', render: (row) => row.percentage === null ? '—' : <Badge tone={row.percentage < 75 ? 'warning' : 'success'}>{row.percentage}%</Badge> },
      ]} /></div>
    </Card>

    <Card>
      <h2 className="font-bold text-text">Attendance sessions</h2>
      <p className="mt-1 text-sm text-muted">{sessions.length} session{sessions.length === 1 ? '' : 's'} · select one to see who was marked.</p>
      <div className="mt-4"><DataTable rows={sessions} empty={<EmptyState title="No sessions in this range" />} columns={[
        { header: 'Date', render: (session) => <div><p className="font-semibold">{session.attendance_date}</p><p className="text-xs text-muted">{session.period ? `Period ${session.period}` : readable(session.session_type)}</p></div> },
        { header: 'Section / subject', render: (session) => <div><p>{subjectName(session.subject_id)}</p><p className="text-xs text-muted">{sectionName(session.section_id)}</p></div> },
        { header: 'Faculty', render: (session) => profileName(session.faculty_id) },
        { header: 'Status', render: (session) => <Badge tone={tone(session.status)}>{session.status}</Badge> },
        { header: 'Marked', render: (session) => `${data.records.filter((row) => row.session_id === session.id).length} / ${activeStudents(session.section_id).length}` },
        { header: 'Roster', render: (session) => <Button className="min-h-8 px-3" variant="secondary" onClick={() => setDetail(session)}>View</Button> },
      ]} /></div>
    </Card>

    <StaffManagementCard data={data} rows={staff} reload={reload} canManage={canManage} />
    {canManage ? <CorrectionReviewCard data={data} reload={reload} /> : <CorrectionMonitorCard data={data} />}

    <Modal isOpen={Boolean(detail)} title={detail ? `${subjectName(detail.subject_id)} · ${detail.attendance_date}` : ''} onClose={() => setDetail(null)}>
      {detail && <>
        <p className="text-sm text-muted">{sectionName(detail.section_id)} · {profileName(detail.faculty_id)} · {detail.status}</p>
        <div className="mt-4 max-h-96 overflow-y-auto"><DataTable rows={activeStudents(detail.section_id)} empty={<EmptyState title="No active enrolled students" />} columns={[
          { header: 'Student', render: (student) => <div><p className="font-semibold">{student.full_name}</p><p className="text-xs text-muted">{student.employee_or_register_number ?? '—'}</p></div> },
          { header: 'Status', render: (student) => { const record = data.records.find((row) => row.session_id === detail.id && row.student_id === student.id); return record ? <Badge tone={tone(record.status)}>{record.status}</Badge> : <span className="text-xs text-muted">Not marked</span> } },
        ]} /></div>
      </>}
    </Modal>
  </div>
}

/**
 * Super Admin only. Seals or reopens every attendance session for one section in a single
 * action — a section already belongs to exactly one academic year, so "class and year" is just
 * "section" here. Sealed sessions reject writes from everyone, including a direct table edit by
 * Super Admin, so this is a deliberate, rarely-used action rather than a routine one.
 */
function ClassLockCard({ sections, reload }: { sections: AttendanceData['sections']; reload: () => Promise<void> }) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '')
  const [confirming, setConfirming] = useState<'lock' | 'unlock' | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const label = (id: string) => { const section = sections.find((row) => row.id === id); return section ? `Year ${section.year_number} · ${section.name}` : '—' }

  const run = async (action: 'lock' | 'unlock') => {
    setBusy(true); setError(''); setFeedback('')
    try {
      const count = action === 'lock' ? await attendanceRepository.lockAttendanceForSection(sectionId) : await attendanceRepository.unlockAttendanceForSection(sectionId)
      setFeedback(`${action === 'lock' ? 'Locked' : 'Unlocked'} ${count} session${count === 1 ? '' : 's'} for ${label(sectionId)}.`)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to ${action} this class's attendance.`)
    } finally {
      setBusy(false); setConfirming(null)
    }
  }

  return <Card>
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning"><LockKeyhole className="size-5" aria-hidden="true" /></span>
      <div>
        <h2 className="font-bold text-text">Lock a class's attendance</h2>
        <p className="mt-1 text-sm text-muted">Seals every attendance session for one section so no Faculty can edit it again, even a session already finalized. Use this at the end of a term or when attendance for a class is settled.</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold text-text">Section<Select className="mt-1 min-w-56" value={sectionId} onChange={(event) => { setSectionId(event.target.value); setFeedback(''); setError('') }}>{sections.map((row) => <option key={row.id} value={row.id}>{label(row.id)}</option>)}</Select></label>
      <Button variant="danger" disabled={!sectionId || busy} onClick={() => setConfirming('lock')}><LockKeyhole className="size-4" /> Lock class</Button>
      <Button variant="secondary" disabled={!sectionId || busy} onClick={() => setConfirming('unlock')}>Unlock class</Button>
    </div>
    {feedback && <p role="status" className="mt-3 text-sm font-medium text-success">{feedback}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
    <ConfirmDialog isOpen={confirming === 'lock'} title="Lock this class's attendance?" description={`Every attendance session for ${label(sectionId)} will be sealed. Faculty will no longer be able to open, submit, or correct attendance for this section. This can be undone with Unlock class.`} confirmLabel="Lock class" onCancel={() => setConfirming(null)} onConfirm={() => void run('lock')} />
    <ConfirmDialog isOpen={confirming === 'unlock'} title="Unlock this class's attendance?" description={`Every locked session for ${label(sectionId)} returns to open. Faculty will be able to edit attendance again.`} confirmLabel="Unlock class" onCancel={() => setConfirming(null)} onConfirm={() => void run('unlock')} />
  </Card>
}

function StaffManagementCard({ data, rows, reload, canManage }: { data: AttendanceData; rows: StaffAttendanceRow[]; reload: () => Promise<void>; canManage: boolean }) {
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const update = async (id: string, status: AttendanceStatus) => { setSavingId(id); setMessage(''); try { await attendanceRepository.updateStaffAttendance(id, status); await reload(); setMessage('Staff attendance updated.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update staff attendance.') } finally { setSavingId(null) } }
  const ordered = [...rows].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date))
  return <Card><h2 className="font-bold text-text">Staff attendance</h2>{message && <p role="status" className="mt-2 text-sm text-muted">{message}</p>}<div className="mt-4"><DataTable rows={ordered} empty={<EmptyState title="No staff attendance in this range" />} columns={[
    { header: 'Staff', render: (row) => <div><p className="font-semibold">{data.profiles.find((profile) => profile.id === row.profile_id)?.full_name ?? '—'}</p><p className="text-xs text-muted">{row.attendance_date}</p></div> },
    { header: 'Check-in / out', render: (row) => `${row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString() : '—'} / ${row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString() : '—'}` },
    { header: 'Status', render: (row) => canManage ? <Select disabled={savingId === row.id} value={row.status} onChange={(event) => void update(row.id, event.target.value as AttendanceStatus)}>{statuses.map((status) => <option key={status}>{status}</option>)}</Select> : <Badge tone={tone(row.status)}>{row.status}</Badge> },
  ]} /></div></Card>
}

function CorrectionMonitorCard({ data }: { data: AttendanceData }) {
  const pending = data.corrections.filter((row) => row.status === 'pending')
  return <Card><h2 className="font-bold text-text">Attendance corrections</h2><div className="mt-4"><DataTable rows={pending} empty={<EmptyState title="No pending attendance corrections" />} columns={[{ header: 'Student', render: (row) => data.profiles.find((profile) => profile.id === row.student_id)?.full_name ?? '—' }, { header: 'Requested change', render: (row) => `${row.original_status} -> ${row.requested_status}` }, { header: 'Reason', render: (row) => row.reason }, { header: 'State', render: (row) => <Badge tone={tone(row.status)}>{row.status}</Badge> }]} /></div></Card>
}

function CorrectionReviewCard({ data, reload }: { data: AttendanceData; reload: () => Promise<void> }) {
  const [review, setReview] = useState<AttendanceCorrectionRow | null>(null)
  const [approve, setApprove] = useState(true)
  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const pending = data.corrections.filter((row) => row.status === 'pending')
  const submit = async () => { if (!review) return; setSaving(true); setMessage(''); try { await attendanceRepository.reviewCorrection(review.id, approve, comments); await reload(); setReview(null); setComments(''); setMessage(`Correction ${approve ? 'approved' : 'rejected'}.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to review correction.') } finally { setSaving(false) } }
  return <Card><h2 className="font-bold text-text">Attendance corrections</h2>{message && <p role="status" className="mt-2 text-sm text-muted">{message}</p>}<div className="mt-4"><DataTable rows={pending} empty={<EmptyState title="No pending attendance corrections" />} columns={[{ header: 'Student', render: (row) => data.profiles.find((profile) => profile.id === row.student_id)?.full_name ?? '—' }, { header: 'Requested change', render: (row) => `${row.original_status} → ${row.requested_status}` }, { header: 'Reason', render: (row) => row.reason }, { header: 'Action', render: (row) => <Button onClick={() => setReview(row)}>Review</Button> }]} /></div><Modal isOpen={Boolean(review)} title="Review attendance correction" onClose={() => setReview(null)}>{review && <div className="space-y-4"><p className="text-sm text-muted">{review.original_status} → {review.requested_status}</p><p className="text-sm text-text">{review.reason}</p><Select value={approve ? 'approve' : 'reject'} onChange={(event) => setApprove(event.target.value === 'approve')}><option value="approve">Approve correction</option><option value="reject">Reject correction</option></Select><Textarea placeholder="Reviewer comments (optional)" value={comments} onChange={(event) => setComments(event.target.value)} /><div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setReview(null)}>Cancel</Button><Button variant={approve ? 'primary' : 'danger'} disabled={saving} onClick={() => void submit()}>{saving ? 'Submitting…' : approve ? 'Approve' : 'Reject'}</Button></div></div>}</Modal></Card>
}

function CorrectionRequestDialog({ record, requestedStatus, setRequestedStatus, reason, setReason, saving, onClose, onSubmit }: { record: AttendanceRecordRow | null; requestedStatus: AttendanceStatus; setRequestedStatus: (status: AttendanceStatus) => void; reason: string; setReason: (value: string) => void; saving: boolean; onClose: () => void; onSubmit: () => Promise<void> }) {
  return <Modal isOpen={Boolean(record)} title="Request attendance correction" onClose={onClose}>{record && <div className="space-y-4"><p className="text-sm text-muted">Current status: {record.status}</p><label className="block text-sm font-semibold">Requested status<Select className="mt-1" value={requestedStatus} onChange={(event) => setRequestedStatus(event.target.value as AttendanceStatus)}>{statuses.filter((status) => status !== record.status).map((status) => <option key={status}>{status}</option>)}</Select></label><label className="block text-sm font-semibold">Reason<Textarea className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void onSubmit()}>{saving ? 'Submitting…' : 'Submit correction'}</Button></div></div>}</Modal>
}


function Feedback({ message }: { message: string }) {
  const success = /submitted|opened|saved|finalized|recorded|marked/i.test(message)
  return success ? <Card><p role="status" className="text-sm font-medium text-success">{message}</p></Card> : <ErrorState title="Attendance needs attention" description={message} />
}

interface ViewProps { data: AttendanceData; reload: () => Promise<void>; userId: string }
