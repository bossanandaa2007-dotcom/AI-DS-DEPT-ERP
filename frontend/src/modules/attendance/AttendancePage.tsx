import { CheckCheck, Clock3, LockKeyhole, RefreshCw, UserCheck } from 'lucide-react'
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
import { getCheckInWindowState } from '@/lib/date-time'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import {
  attendanceRepository,
  type AttendanceCorrectionRow,
  type AttendanceData,
  type AttendanceRecordRow,
  type AttendanceSessionRow,
  type AttendanceStatus,
} from '@/services/supabase/attendanceRepository'

const statuses: AttendanceStatus[] = ['present', 'late', 'absent']
const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const today = () => new Date().toISOString().slice(0, 10)
const tone = (status: string): 'success' | 'warning' | 'primary' | 'muted' => status === 'present' || status === 'finalized' ? 'success' : status === 'late' || status === 'open' || status === 'pending' ? 'warning' : status === 'absent' || status === 'rejected' ? 'muted' : 'primary'
const readable = (value: string) => value.replaceAll('_', ' ')

export function AttendancePage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => attendanceRepository.loadAttendanceData(), [])
  const resource = useAsyncResource(load)
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
  const [correctionRecord, setCorrectionRecord] = useState<AttendanceRecordRow | null>(null)
  const [requestedStatus, setRequestedStatus] = useState<AttendanceStatus>('present')
  const [reason, setReason] = useState('')
  const date = today()
  const enrollment = data.enrollments.find((row) => row.student_id === userId && row.status === 'active')
  const profile = data.profiles.find((row) => row.id === userId)
  const sectionId = enrollment?.section_id ?? profile?.section_id
  const dailySession = data.sessions.find((row) => row.session_type === 'daily' && row.section_id === sectionId && row.attendance_date === date)
  const dailyRecord = data.records.find((row) => row.session_id === dailySession?.id && row.student_id === userId)
  const personalRecords = data.records.filter((row) => row.student_id === userId)
  const pendingCorrectionIds = new Set(data.corrections.filter((row) => row.status === 'pending').map((row) => row.attendance_record_id))
  const windowState = getCheckInWindowState(new Date())

  const checkIn = async () => {
    if (!dailySession) { setMessage('Your Class Teacher has not opened today’s daily check-in session.'); return }
    setSaving(true); setMessage('')
    try { await attendanceRepository.studentDailyCheckIn(dailySession.id); await reload(); setMessage('Daily check-in submitted for Faculty verification.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to check in.') } finally { setSaving(false) }
  }
  const requestCorrection = async () => {
    if (!correctionRecord) return
    setSaving(true); setMessage('')
    try { await attendanceRepository.requestCorrection(correctionRecord, requestedStatus, reason); await reload(); setCorrectionRecord(null); setReason(''); setMessage('Attendance correction submitted.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to request correction.') } finally { setSaving(false) }
  }
  return <div className="space-y-6"><PageHeader title="My attendance" description="Daily check-in, subject attendance, and correction tracking from live records." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />{message && <Feedback message={message} />}<Card><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-text">Today’s daily check-in</h2><p className="mt-1 text-sm text-muted">{date} · Check-in window: {readable(windowState)}</p></div><Clock3 className="size-5 text-secondary" /></div>{dailyRecord ? <div className="mt-4"><Badge tone={tone(dailySession?.status ?? dailyRecord.status)}>{dailySession?.status === 'finalized' ? 'finalized' : dailyRecord.status}</Badge><p className="mt-2 text-sm text-muted">{dailyRecord.check_in_time ? `Checked in at ${new Date(dailyRecord.check_in_time).toLocaleTimeString()}.` : 'Attendance entered by Faculty.'}</p></div> : <Button className="mt-4" disabled={saving || windowState !== 'open' || !dailySession} onClick={() => void checkIn()}><UserCheck className="size-4" /> {saving ? 'Checking in…' : 'Check in'}</Button>}{!dailySession && <p className="mt-3 text-sm text-warning">Daily check-in becomes available after the Class Teacher opens today’s session.</p>}</Card><Card><h2 className="font-bold text-text">Personal attendance history</h2><div className="mt-4"><DataTable rows={personalRecords} empty={<EmptyState title="No attendance records yet" />} columns={[{ header: 'Date / subject', render: (record) => { const session = data.sessions.find((row) => row.id === record.session_id); return <div><p className="font-semibold">{session?.attendance_date ?? '—'} · {session?.session_type ?? 'attendance'}</p><p className="text-xs text-muted">{data.subjects.find((row) => row.id === session?.subject_id)?.name ?? 'Daily attendance'}</p></div> } }, { header: 'Status', render: (record) => <Badge tone={tone(record.status)}>{record.status}</Badge> }, { header: 'Session', render: (record) => { const session = data.sessions.find((row) => row.id === record.session_id); return <Badge tone={tone(session?.status ?? 'draft')}>{session?.status ?? 'draft'}</Badge> } }, { header: 'Correction', render: (record) => pendingCorrectionIds.has(record.id) ? <Badge tone="warning">Pending</Badge> : <Button className="min-h-8 px-3" variant="secondary" onClick={() => { setCorrectionRecord(record); setRequestedStatus(record.status === 'present' ? 'late' : 'present') }}>Request</Button> }]} /></div></Card><CorrectionRequestDialog record={correctionRecord} requestedStatus={requestedStatus} setRequestedStatus={setRequestedStatus} reason={reason} setReason={setReason} saving={saving} onClose={() => setCorrectionRecord(null)} onSubmit={requestCorrection} /></div>
}

function FacultyAttendance({ data, reload, userId }: ViewProps) {
  const [date, setDate] = useState(today())
  const [periodId, setPeriodId] = useState('')
  const [dailySectionId, setDailySectionId] = useState('')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [finalizeSession, setFinalizeSession] = useState<AttendanceSessionRow | null>(null)
  const assignments = data.assignments.filter((row) => row.faculty_id === userId && row.is_active)
  const assignedSectionIds = new Set(assignments.map((row) => row.section_id))
  const periods = data.timetable.filter((entry) => assignedSectionIds.has(entry.section_id) && assignments.some((assignment) => assignment.section_id === entry.section_id && (assignment.subject_id === entry.subject_id || assignment.assignment_type === 'class_teacher')))
  const classTeacherSections = data.sections.filter((section) => assignments.some((assignment) => assignment.section_id === section.id && assignment.assignment_type === 'class_teacher'))
  const selectedPeriod = periods.find((row) => row.id === periodId)
  const selectedSession = data.sessions.find((row) => row.timetable_entry_id === periodId && row.attendance_date === date)
  const dailySession = data.sessions.find((row) => row.session_type === 'daily' && row.section_id === dailySectionId && row.attendance_date === date)
  const activeStudents = (sectionId: string) => data.enrollments.filter((row) => row.section_id === sectionId && row.status === 'active').map((row) => data.profiles.find((profile) => profile.id === row.student_id)).filter((row): row is NonNullable<typeof row> => Boolean(row && row.status === 'active'))
  const subjectStudents = selectedPeriod ? activeStudents(selectedPeriod.section_id) : []
  const dailyStudents = dailySectionId ? activeStudents(dailySectionId) : []

  const openSubject = async () => { if (!selectedPeriod) return; setSaving(true); setMessage(''); try { await attendanceRepository.openSubjectSession(selectedPeriod.id, date); await reload(); setMessage('Subject attendance session opened.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to open attendance.') } finally { setSaving(false) } }
  const openDaily = async () => { if (!dailySectionId) return; setSaving(true); setMessage(''); try { await attendanceRepository.openDailySession(dailySectionId, date); await reload(); setMessage('Daily attendance session opened.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to open daily attendance.') } finally { setSaving(false) } }
  const saveStatus = async (session: AttendanceSessionRow, studentId: string, status: AttendanceStatus) => { setSaving(true); setMessage(''); try { await attendanceRepository.saveAttendanceRecord(session, studentId, status); await reload() } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save attendance.') } finally { setSaving(false) } }
  const allPresent = async () => { if (!selectedSession) return; setSaving(true); setMessage(''); try { await attendanceRepository.saveAllAttendance(selectedSession, subjectStudents, 'present'); await reload(); setMessage('All enrolled students marked present.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save attendance.') } finally { setSaving(false) } }
  const verifyDaily = async (record: AttendanceRecordRow, status: AttendanceStatus) => { setSaving(true); setMessage(''); try { await attendanceRepository.verifyDailyRecord(record.id, status); await reload() } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to verify check-in.') } finally { setSaving(false) } }
  const finalize = async () => { if (!finalizeSession) return; const students = activeStudents(finalizeSession.section_id); const count = data.records.filter((record) => record.session_id === finalizeSession.id).length; if (count < students.length) { setMessage('Set attendance for every active enrolled student before finalizing.'); setFinalizeSession(null); return } setSaving(true); try { await attendanceRepository.finalizeSession(finalizeSession.id); await reload(); setFinalizeSession(null); setMessage('Attendance finalized and locked.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to finalize attendance.') } finally { setSaving(false) } }

  return <div className="space-y-6"><PageHeader title="Faculty attendance" description="Daily verification and subject attendance are restricted to active Faculty assignments." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />{message && <Feedback message={message} />}<Card><label className="block max-w-xs text-sm font-semibold">Attendance date<Input className="mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></Card><DailyVerificationCard data={data} session={dailySession} sections={classTeacherSections} sectionId={dailySectionId} setSectionId={setDailySectionId} students={dailyStudents} saving={saving} onOpen={openDaily} onVerify={verifyDaily} onSaveStatus={saveStatus} onFinalize={setFinalizeSession} /><Card><h2 className="font-bold text-text">Assigned timetable periods</h2><div className="mt-4"><DataTable rows={periods} empty={<EmptyState title="No assigned subject periods" />} columns={[{ header: 'Period', render: (entry) => `${days[entry.day_of_week]} · P${entry.period} · ${entry.starts_at}–${entry.ends_at}` }, { header: 'Subject', render: (entry) => data.subjects.find((row) => row.id === entry.subject_id)?.name ?? '—' }, { header: 'Section', render: (entry) => data.sections.find((row) => row.id === entry.section_id)?.name ?? '—' }, { header: 'Action', render: (entry) => <Button variant={periodId === entry.id ? 'primary' : 'secondary'} onClick={() => setPeriodId(entry.id)}>{data.sessions.find((session) => session.timetable_entry_id === entry.id && session.attendance_date === date)?.status === 'finalized' ? 'View finalized' : 'Open'}</Button> }]} /></div></Card>{selectedPeriod && <SubjectAttendanceCard data={data} period={selectedPeriod} session={selectedSession} students={subjectStudents} search={search} setSearch={setSearch} saving={saving} onOpen={openSubject} onSave={saveStatus} onAllPresent={allPresent} onFinalize={setFinalizeSession} />}<CorrectionReviewCard data={data} reload={reload} /><StaffSelfCard data={data} reload={reload} userId={userId} /><ConfirmDialog isOpen={Boolean(finalizeSession)} title="Finalize attendance?" description="Finalization permanently locks direct edits. Later changes require an approved correction." confirmLabel="Finalize and lock" onCancel={() => setFinalizeSession(null)} onConfirm={() => void finalize()} /></div>
}

function DailyVerificationCard({ data, session, sections, sectionId, setSectionId, students, saving, onOpen, onVerify, onSaveStatus, onFinalize }: { data: AttendanceData; session?: AttendanceSessionRow; sections: AttendanceData['sections']; sectionId: string; setSectionId: (id: string) => void; students: AttendanceData['profiles']; saving: boolean; onOpen: () => Promise<void>; onVerify: (record: AttendanceRecordRow, status: AttendanceStatus) => Promise<void>; onSaveStatus: (session: AttendanceSessionRow, studentId: string, status: AttendanceStatus) => Promise<void>; onFinalize: (session: AttendanceSessionRow) => void }) {
  const records = data.records.filter((row) => row.session_id === session?.id)
  const locked = session?.status === 'finalized' || session?.status === 'locked'
  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-text">Daily check-in verification</h2><p className="mt-1 text-sm text-muted">Available to assigned Class Teachers for their sections.</p></div>{session && <Badge tone={tone(session.status)}>{session.status}</Badge>}</div><div className="mt-4 flex flex-wrap gap-3"><Select className="max-w-sm" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">Select Class Teacher section</option>{sections.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>{sectionId && !session && <Button disabled={saving} onClick={() => void onOpen()}>Open daily session</Button>}{session && !locked && <Button variant="secondary" onClick={() => onFinalize(session)}><LockKeyhole className="size-4" /> Finalize daily attendance</Button>}</div>{session && <div className="mt-4"><DataTable rows={students} empty={<EmptyState title="No active enrolled students" />} columns={[{ header: 'Student', render: (student) => <div><p className="font-semibold">{student.full_name}</p><p className="text-xs text-muted">{student.employee_or_register_number ?? '—'}</p></div> }, { header: 'Check-in', render: (student) => { const record = records.find((row) => row.student_id === student.id); return record?.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : 'Not checked in' } }, { header: 'Verification', render: (student) => { const record = records.find((row) => row.student_id === student.id); if (locked) return <Badge tone={tone(record?.status ?? 'absent')}>{record?.status ?? 'absent'}</Badge>; if (!record) return <Select disabled={saving} defaultValue="" onChange={(event) => void onSaveStatus(session, student.id, event.target.value as AttendanceStatus)}><option value="" disabled>Set status</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</Select>; return <Select disabled={saving} value={record.status} onChange={(event) => void onVerify(record, event.target.value as AttendanceStatus)}>{statuses.map((status) => <option key={status}>{status}</option>)}</Select> } }]} /></div>}</Card>
}

function SubjectAttendanceCard({ data, period, session, students, search, setSearch, saving, onOpen, onSave, onAllPresent, onFinalize }: { data: AttendanceData; period: AttendanceData['timetable'][number]; session?: AttendanceSessionRow; students: AttendanceData['profiles']; search: string; setSearch: (value: string) => void; saving: boolean; onOpen: () => Promise<void>; onSave: (session: AttendanceSessionRow, studentId: string, status: AttendanceStatus) => Promise<void>; onAllPresent: () => Promise<void>; onFinalize: (session: AttendanceSessionRow) => void }) {
  const records = data.records.filter((row) => row.session_id === session?.id)
  const locked = session?.status === 'finalized' || session?.status === 'locked'
  const filtered = students.filter((student) => `${student.full_name} ${student.employee_or_register_number ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const counts = { present: records.filter((row) => row.status === 'present').length, late: records.filter((row) => row.status === 'late').length, absent: records.filter((row) => row.status === 'absent').length, pending: students.length - records.length }
  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-text">{data.subjects.find((row) => row.id === period.subject_id)?.name ?? 'Subject attendance'}</h2><p className="mt-1 text-sm text-muted">{period.starts_at}–{period.ends_at} · {period.room}</p></div>{!session ? <Button disabled={saving} onClick={() => void onOpen()}>Start attendance</Button> : <Badge tone={tone(session.status)}>{session.status}</Badge>}</div>{session && <><div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-4">{Object.entries(counts).map(([label, value]) => <Card key={label} className="p-3"><p className="text-xs text-muted">{label}</p><p className="text-xl font-bold">{value}</p></Card>)}</div><div className="mt-4 flex flex-col gap-3 sm:flex-row"><Input placeholder="Search students" value={search} onChange={(event) => setSearch(event.target.value)} />{!locked && <Button variant="secondary" disabled={saving} onClick={() => void onAllPresent()}><CheckCheck className="size-4" /> All present</Button>}</div><div className="mt-4"><DataTable rows={filtered} empty={<EmptyState title="No active students in this section" />} columns={[{ header: 'Student', render: (student) => `${student.employee_or_register_number ?? '—'} · ${student.full_name}` }, { header: 'Status', render: (student) => { const record = records.find((row) => row.student_id === student.id); return locked ? <Badge tone={tone(record?.status ?? 'absent')}>{record?.status ?? 'absent'}</Badge> : <Select disabled={saving} value={record?.status ?? ''} onChange={(event) => void onSave(session, student.id, event.target.value as AttendanceStatus)}><option value="" disabled>Set status</option>{statuses.map((status) => <option key={status}>{status}</option>)}</Select> } }]} /></div>{!locked && <div className="mt-5 flex justify-end"><Button onClick={() => onFinalize(session)}><LockKeyhole className="size-4" /> Review and finalize</Button></div>}</>}</Card>
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
  const [date, setDate] = useState(today())
  const [sectionId, setSectionId] = useState('all')
  const sessions = data.sessions.filter((row) => row.attendance_date === date && (sectionId === 'all' || row.section_id === sectionId))
  const sessionIds = new Set(sessions.map((row) => row.id))
  const records = data.records.filter((row) => sessionIds.has(row.session_id))
  const staff = data.staffAttendance.filter((row) => row.attendance_date === date)
  return <div className="space-y-6"><PageHeader title="Department attendance" description="RLS-scoped attendance overview for the managed department." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} /><Card><div className="grid gap-3 sm:grid-cols-2"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="all">All sections</option>{data.sections.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></div></Card><div className="grid gap-4 sm:grid-cols-3"><Metric label="Sessions" value={sessions.length} /><Metric label="Student records" value={records.length} /><Metric label="Staff records" value={staff.length} /></div><Card><h2 className="font-bold text-text">Attendance sessions</h2><div className="mt-4"><DataTable rows={sessions} empty={<EmptyState title="No sessions for this date" />} columns={[{ header: 'Section / type', render: (session) => `${data.sections.find((row) => row.id === session.section_id)?.name ?? '—'} · ${session.session_type}` }, { header: 'Subject', render: (session) => data.subjects.find((row) => row.id === session.subject_id)?.name ?? 'Daily attendance' }, { header: 'Faculty', render: (session) => data.profiles.find((row) => row.id === session.faculty_id)?.full_name ?? '—' }, { header: 'Status', render: (session) => <Badge tone={tone(session.status)}>{session.status}</Badge> }, { header: 'Records', render: (session) => data.records.filter((row) => row.session_id === session.id).length }]} /></div></Card><StaffManagementCard data={data} date={date} reload={reload} /><CorrectionReviewCard data={data} reload={reload} /><StaffSelfCard data={data} reload={reload} userId={userId} /></div>
}

function StaffManagementCard({ data, date, reload }: { data: AttendanceData; date: string; reload: () => Promise<void> }) {
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

function CorrectionRequestDialog({ record, requestedStatus, setRequestedStatus, reason, setReason, saving, onClose, onSubmit }: { record: AttendanceRecordRow | null; requestedStatus: AttendanceStatus; setRequestedStatus: (status: AttendanceStatus) => void; reason: string; setReason: (value: string) => void; saving: boolean; onClose: () => void; onSubmit: () => Promise<void> }) {
  return <Modal isOpen={Boolean(record)} title="Request attendance correction" onClose={onClose}>{record && <div className="space-y-4"><p className="text-sm text-muted">Current status: {record.status}</p><label className="block text-sm font-semibold">Requested status<Select className="mt-1" value={requestedStatus} onChange={(event) => setRequestedStatus(event.target.value as AttendanceStatus)}>{statuses.filter((status) => status !== record.status).map((status) => <option key={status}>{status}</option>)}</Select></label><label className="block text-sm font-semibold">Reason<Textarea className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void onSubmit()}>{saving ? 'Submitting…' : 'Submit correction'}</Button></div></div>}</Modal>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-text">{value}</p></Card>
}

function Feedback({ message }: { message: string }) {
  const success = /submitted|opened|saved|finalized|recorded|marked/i.test(message)
  return success ? <Card><p className="text-sm font-medium text-success">{message}</p></Card> : <ErrorState title="Attendance needs attention" description={message} />
}

interface ViewProps { data: AttendanceData; reload: () => Promise<void>; userId: string }
