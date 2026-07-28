import { CalendarDays, Clock, MapPin, Pencil, Plus, RefreshCw, Trash2, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ROUTE_PATHS } from '@/app/router/route-paths'
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
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { academicRepository } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'

type Entry = Database['public']['Tables']['timetable_entries']['Row']
type Period = Database['public']['Tables']['timetable_periods']['Row']
type Subject = Database['public']['Tables']['subjects']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type WorkingDay = Database['public']['Tables']['timetable_working_days']['Row']
type AttendanceSession = Database['public']['Tables']['attendance_sessions']['Row']
type TimetableData = Awaited<ReturnType<typeof academicRepository.loadTimetableData>>
type Draft = { sectionId: string; subjectId: string; facultyId: string; day: string; period: string; start: string; end: string; room: string; lab: string }

const emptyDraft: Draft = { sectionId: '', subjectId: '', facultyId: '', day: '1', period: '1', start: '09:00', end: '10:00', room: '', lab: '' }
const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const localDay = () => { const day = new Date().getDay(); return day === 0 ? 7 : day }
const inEffect = (entry: Entry, date = new Date().toISOString().slice(0, 10)) => entry.effective_from <= date && (!entry.effective_to || entry.effective_to >= date)
const timeActiveRange = (startsAt: string, endsAt: string) => {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const [startHour, startMinute] = startsAt.split(':').map(Number)
  const [endHour, endMinute] = endsAt.split(':').map(Number)
  return minutes >= startHour * 60 + startMinute && minutes <= endHour * 60 + endMinute
}
const timeActive = (period: Period) => {
  return timeActiveRange(period.starts_at, period.ends_at)
}
const dateForWeekday = (dayOfWeek: number) => {
  const date = new Date()
  const diff = dayOfWeek - localDay()
  date.setDate(date.getDate() + diff)
  return date.toISOString().slice(0, 10)
}

export function TimetablePage() {
  const { currentUser } = useAuth()
  const resource = useAsyncResource(useCallback(() => academicRepository.loadTimetableData(), []))
  const [sectionFilter, setSectionFilter] = useState('all')
  const [facultyFilter, setFacultyFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState('all')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Entry | null>(null)

  if (resource.isLoading) return <LoadingState label="Loading timetable..." />
  if (resource.error) return <div className="space-y-3"><ErrorState title="Unable to load timetable" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  const data = resource.data
  if (!data || !currentUser) return null
  if (currentUser.role === 'student') return <StudentTimetable data={data} userId={currentUser.id} reload={resource.reload} />
  if (currentUser.role === 'faculty') return <FacultyTimetableCalendar data={data} userId={currentUser.id} reload={resource.reload} />

  const isManager = currentUser.role === 'super_admin' || currentUser.role === 'hod'
  const visible = data.timetable.filter((entry) => {
    if (!isManager && currentUser.role === 'faculty' && entry.faculty_id !== currentUser.id) return false
    if (!isManager && currentUser.role === 'lab_assistant' && entry.lab_assistant_id !== currentUser.id && !entry.lab) return false
    return (sectionFilter === 'all' || entry.section_id === sectionFilter) && (facultyFilter === 'all' || entry.faculty_id === facultyFilter) && (dayFilter === 'all' || String(entry.day_of_week) === dayFilter)
  })
  const subject = (id: string) => data.subjects.find((item) => item.id === id)
  const section = (id: string) => data.sections.find((item) => item.id === id)
  const faculty = (id: string | null) => data.profiles.find((item) => item.id === id)?.full_name ?? 'Unassigned'
  const activeFaculty = data.profiles.filter((item) => item.role === 'faculty' && item.status === 'active')
  const open = (entry?: Entry) => {
    setEditing(entry ?? null); setMessage('')
    setDraft(entry ? { sectionId: entry.section_id, subjectId: entry.subject_id, facultyId: entry.faculty_id ?? '', day: String(entry.day_of_week), period: String(entry.period), start: entry.starts_at, end: entry.ends_at, room: entry.room, lab: entry.lab ?? '' } : emptyDraft)
    setFormOpen(true)
  }
  const save = async () => {
    if (!draft.sectionId || !draft.subjectId || !draft.start || !draft.end || !draft.room.trim()) { setMessage('Section, subject, times, and room are required.'); return }
    const selectedSection = section(draft.sectionId)
    const selectedPeriod = data.periods.find((period) => period.is_active && period.period_type === 'teaching' && period.period_number === Number(draft.period) && (period.department_id === null || period.department_id === selectedSection?.department_id))
    const allocation = data.assignments.find((assignment) => assignment.is_active && assignment.faculty_id === draft.facultyId && assignment.subject_id === draft.subjectId && assignment.section_id === draft.sectionId)
    if (!selectedSection || !selectedPeriod) { setMessage('Select a configured teaching period for this section.'); return }
    if (!allocation) { setMessage('Select a Faculty member assigned to this subject and section.'); return }
    const academicYear = data.academicYears.find((item) => item.id === selectedSection.academic_year_id)
    setSaving(true); setMessage('')
    try { await academicRepository.saveTimetableEntry({ entryId: editing?.id, sectionId: draft.sectionId, subjectId: draft.subjectId, facultyId: draft.facultyId, allocationId: allocation.id, periodId: selectedPeriod.id, dayOfWeek: Number(draft.day), room: draft.room.trim(), lab: draft.lab.trim() || undefined, effectiveFrom: editing?.effective_from ?? academicYear?.starts_on ?? new Date().toISOString().slice(0, 10), effectiveTo: editing?.effective_to ?? academicYear?.ends_on ?? undefined }); await resource.reload(); setFormOpen(false) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to save timetable entry.') } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!deleting) return
    try { await academicRepository.deactivateTimetableEntry(deleting.id); await resource.reload(); setDeleting(null) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to deactivate timetable entry.'); setDeleting(null) }
  }
  const title = isManager ? 'Department weekly timetable' : currentUser.role === 'lab_assistant' ? 'Lab schedule' : 'Timetable'

  return <div className="space-y-6"><PageHeader title={title} description="Live timetable entries are scoped by your authenticated role and section access." actions={<><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>{isManager && <Button onClick={() => open()}><Plus className="size-4" /> Add entry</Button>}</>} />{message && !formOpen && <ErrorState title="Timetable action needs attention" description={message} />}<Card><div className="mb-4 grid gap-3 md:grid-cols-3">{isManager && <Select aria-label="Filter section" value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}><option value="all">All sections</option>{data.sections.map((item) => <option key={item.id} value={item.id}>Year {item.year_number} - {item.name}</option>)}</Select>}<Select aria-label="Filter Faculty" value={facultyFilter} onChange={(event) => setFacultyFilter(event.target.value)}><option value="all">All Faculty</option>{activeFaculty.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</Select><Select aria-label="Filter day" value={dayFilter} onChange={(event) => setDayFilter(event.target.value)}><option value="all">All days</option>{dayNames.slice(1).map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</Select></div><DataTable rows={[...visible].sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period)} empty={<EmptyState title="No timetable entries" description="No entries are available for your current access and filters." />} columns={[{ header: 'Day / time', render: (entry) => <div><p className="font-semibold">{dayNames[entry.day_of_week]} - P{entry.period}</p><p className="text-xs text-muted">{entry.starts_at} - {entry.ends_at}</p></div> }, { header: 'Subject', render: (entry) => <div><p className="font-semibold">{subject(entry.subject_id)?.name ?? 'Unknown subject'}</p><p className="text-xs text-muted">{subject(entry.subject_id)?.code ?? '-'}</p></div> }, { header: 'Faculty', render: (entry) => faculty(entry.faculty_id) }, { header: 'Section / room', render: (entry) => `${section(entry.section_id)?.name ?? '-'} - ${entry.room}${entry.lab ? ` - ${entry.lab}` : ''}` }, ...(isManager ? [{ header: 'Actions', render: (entry: Entry) => <div className="flex gap-1"><Button variant="ghost" className="min-h-8 px-2" onClick={() => open(entry)}><Pencil className="size-4" /></Button><Button variant="ghost" className="min-h-8 px-2 text-error" onClick={() => setDeleting(entry)}><Trash2 className="size-4" /></Button></div> }] : [])]} /></Card><Modal isOpen={formOpen} title={editing ? 'Edit timetable entry' : 'Add timetable entry'} onClose={() => setFormOpen(false)}><div className="grid gap-3 sm:grid-cols-2"><Field label="Section"><Select value={draft.sectionId} onChange={(event) => setDraft({ ...draft, sectionId: event.target.value })}><option value="">Select section</option>{data.sections.map((item) => <option key={item.id} value={item.id}>Year {item.year_number} - {item.name}</option>)}</Select></Field><Field label="Subject"><Select value={draft.subjectId} onChange={(event) => setDraft({ ...draft, subjectId: event.target.value })}><option value="">Select subject</option>{data.subjects.filter((item) => !draft.sectionId || item.semester_id === section(draft.sectionId)?.semester_id).map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</Select></Field><Field label="Faculty"><Select value={draft.facultyId} onChange={(event) => setDraft({ ...draft, facultyId: event.target.value })}><option value="">Unassigned</option>{activeFaculty.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</Select></Field><Field label="Day"><Select value={draft.day} onChange={(event) => setDraft({ ...draft, day: event.target.value })}>{dayNames.slice(1).map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</Select></Field><Field label="Period"><Input type="number" min="1" value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value })} /></Field><Field label="Room"><Input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} /></Field><Field label="Start"><Input type="time" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></Field><Field label="End"><Input type="time" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></Field><Field label="Lab"><Input value={draft.lab} onChange={(event) => setDraft({ ...draft, lab: event.target.value })} /></Field></div>{message && <p className="mt-3 text-sm text-error">{message}</p>}<div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Save entry'}</Button></div></Modal><ConfirmDialog isOpen={Boolean(deleting)} title="Delete timetable entry?" description="This removes the selected timetable entry." confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={() => void remove()} /></div>
}

function FacultyTimetableCalendar({ data, userId, reload }: { data: TimetableData; userId: string; reload: () => Promise<void> }) {
  const navigate = useNavigate()
  const [mobileDay, setMobileDay] = useState(localDay())
  const assignedEntries = uniqueEntries(data.timetable.filter((entry) => entry.is_active && entry.faculty_id === userId && inEffect(entry) && data.assignments.some((assignment) => assignment.is_active && assignment.faculty_id === userId && assignment.section_id === entry.section_id && assignment.subject_id === entry.subject_id))).sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period || a.starts_at.localeCompare(b.starts_at))
  const departmentIds = new Set(assignedEntries.map((entry) => entry.department_id))
  const days = data.workingDays.filter((day) => day.is_enabled && day.day_of_week >= 1 && day.day_of_week <= 7 && (day.department_id === null || departmentIds.has(day.department_id))).sort((a, b) => a.display_order - b.display_order)
  const periods = data.periods.filter((period) => period.is_active && (period.department_id === null || departmentIds.has(period.department_id))).sort((a, b) => a.display_order - b.display_order)
  const activeMobileDay = days.some((day) => day.day_of_week === mobileDay) ? mobileDay : days[0]?.day_of_week ?? localDay()
  const openAttendance = (entry: Entry) => {
    const date = dateForWeekday(entry.day_of_week)
    navigate(`${ROUTE_PATHS.faculty}/attendance?date=${encodeURIComponent(date)}&periodId=${encodeURIComponent(entry.id)}`)
  }

  return <div className="space-y-6">
    <PageHeader title="Faculty timetable" description="Weekly calendar from your active assigned timetable periods." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    {!assignedEntries.length ? <EmptyState title="No assigned timetable periods" description="Assigned periods appear here after Admin publishes your active timetable." /> : !days.length ? <EmptyState title="No working days configured" description="Enabled working days are required to render the weekly calendar." /> : !periods.length ? <EmptyState title="No periods configured" description="Teaching periods are required to render the weekly calendar." /> : <>
      <Card className="hidden overflow-x-auto md:block"><FacultyDesktopGrid days={days} periods={periods} entries={assignedEntries} data={data} onOpen={openAttendance} /></Card>
      <Card className="md:hidden"><div className="flex gap-2 overflow-x-auto pb-1">{days.map((day) => <Button key={day.id} className="px-3" variant={activeMobileDay === day.day_of_week ? 'primary' : 'secondary'} onClick={() => setMobileDay(day.day_of_week)}>{day.label.slice(0, 3)}</Button>)}</div><div className="mt-4 space-y-3">{periods.map((period) => <FacultyPeriodCard key={period.id} day={activeMobileDay} period={period} entry={entryFor(assignedEntries, activeMobileDay, period)} data={data} onOpen={openAttendance} />)}</div></Card>
    </>}
  </div>
}

function uniqueEntries(entries: Entry[]) {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.day_of_week}:${entry.timetable_period_id ?? entry.period}:${entry.section_id}:${entry.subject_id}:${entry.starts_at}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function entryFor(entries: Entry[], day: number, period: Period) {
  return entries.find((entry) => entry.day_of_week === day && (entry.timetable_period_id === period.id || (!entry.timetable_period_id && entry.period === period.period_number)))
}

function FacultyDesktopGrid({ days, periods, entries, data, onOpen }: { days: WorkingDay[]; periods: Period[]; entries: Entry[]; data: TimetableData; onOpen: (entry: Entry) => void }) {
  const today = localDay()
  return <div className="min-w-[64rem] overflow-hidden rounded-lg border border-border"><div className="grid" style={{ gridTemplateColumns: `8rem repeat(${periods.length}, minmax(11rem, 1fr))` }}><div className="border-b border-r bg-background p-3 text-sm font-bold">Day</div>{periods.map((period) => <div key={period.id} className="border-b border-r bg-background p-2 text-center text-xs font-bold"><p>{period.period_number ? `P${period.period_number}` : period.label}</p><p className="font-medium text-muted">{period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}</p></div>)}{days.flatMap((day) => [<div key={`${day.id}-label`} className={`border-b border-r p-3 text-sm font-bold ${day.day_of_week === today ? 'bg-primary/10 text-primary' : ''}`}>{day.label}</div>, ...periods.map((period) => { const entry = entryFor(entries, day.day_of_week, period); const current = Boolean(entry && day.day_of_week === today && timeActiveRange(entry.starts_at, entry.ends_at)); return <div key={`${day.id}-${period.id}`} className={`min-h-36 border-b border-r p-2 ${day.day_of_week === today ? 'bg-primary/5' : ''} ${current ? 'outline outline-2 outline-information/50' : ''}`}><FacultyEntrySummary entry={entry} data={data} onOpen={onOpen} /></div> })])}</div></div>
}

function FacultyPeriodCard({ day, period, entry, data, onOpen }: { day: number; period: Period; entry?: Entry; data: TimetableData; onOpen: (entry: Entry) => void }) {
  const current = Boolean(entry && day === localDay() && timeActiveRange(entry.starts_at, entry.ends_at))
  return <article className={`rounded-lg border border-border p-3 ${current ? 'outline outline-2 outline-information/50' : ''}`}><div className="mb-2 flex items-center justify-between gap-2"><p className="font-bold text-text">{period.period_number ? `Period ${period.period_number}` : period.label}</p><span className="text-xs text-muted">{period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}</span></div><FacultyEntrySummary entry={entry} data={data} onOpen={onOpen} /></article>
}

function FacultyEntrySummary({ entry, data, onOpen }: { entry?: Entry; data: TimetableData; onOpen: (entry: Entry) => void }) {
  if (!entry) return <p className="text-sm text-muted">No class scheduled</p>
  const subject = data.subjects.find((item) => item.id === entry.subject_id)
  const section = data.sections.find((item) => item.id === entry.section_id)
  const session = sessionFor(data.attendanceSessions, entry)
  const status = session?.status ?? 'not_opened'
  const lab = Boolean(entry.lab || subject?.subject_type === 'laboratory' || subject?.is_lab)
  return <div className="space-y-2"><div className="flex flex-wrap gap-1"><Badge tone={lab ? 'warning' : 'primary'}>{lab ? 'Lab' : 'Theory'}</Badge><Badge tone={statusTone(status)}>{statusLabel(status)}</Badge></div><p className="text-sm font-bold text-text">{subject?.code ?? 'Subject'} - {subject?.name ?? 'Unknown subject'}</p><p className="text-xs text-muted">Year {section?.year_number ?? '-'} - {section?.name ?? 'Section'}</p><p className="flex items-center gap-1 text-xs text-muted"><Clock className="size-3" />{entry.starts_at.slice(0, 5)}-{entry.ends_at.slice(0, 5)}</p><p className="flex items-center gap-1 text-xs text-muted"><MapPin className="size-3" />{entry.lab ? `Lab: ${entry.lab}` : `Room: ${entry.room}`}</p><Button className="min-h-8 px-3" variant={status === 'finalized' || status === 'locked' ? 'secondary' : 'primary'} onClick={() => onOpen(entry)}><CalendarDays className="size-4" />{status === 'finalized' || status === 'locked' ? 'View' : 'Open'}</Button></div>
}

function sessionFor(sessions: AttendanceSession[], entry: Entry) {
  const date = dateForWeekday(entry.day_of_week)
  return sessions.find((session) => session.timetable_entry_id === entry.id && session.attendance_date === date)
}

function statusLabel(status: string) {
  return status === 'not_opened' ? 'Not opened' : status.replace(/_/g, ' ')
}

function statusTone(status: string): 'primary' | 'success' | 'warning' | 'muted' {
  if (status === 'finalized' || status === 'locked') return 'success'
  if (status === 'open' || status === 'draft') return 'primary'
  if (status === 'cancelled') return 'warning'
  return 'muted'
}

function StudentTimetable({ data, userId, reload }: { data: TimetableData; userId: string; reload: () => Promise<void> }) {
  const [mobileDay, setMobileDay] = useState(localDay())
  useEffect(() => {
    const intervalId = window.setInterval(() => { if (!document.hidden) void reload() }, 30000)
    return () => window.clearInterval(intervalId)
  }, [reload])
  const enrollment = data.enrollments.find((item) => item.student_id === userId && item.status === 'active')
  const section = data.sections.find((item) => item.id === enrollment?.section_id)
  const year = data.academicYears.find((item) => item.id === enrollment?.academic_year_id || item.id === section?.academic_year_id)
  const semester = data.semesters.find((item) => item.id === section?.semester_id)
  if (!enrollment || !section || !year || !semester) return <div className="space-y-4"><PageHeader title="My timetable" description="Your timetable appears after active enrollment is mapped." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Retry</Button>} /><EmptyState title="No active timetable context" description="Active academic year, semester, year, and section were not found for this student." /></div>

  const departmentDays = data.workingDays.filter((item) => item.department_id === section.department_id)
  const days = (departmentDays.length ? departmentDays : data.workingDays.filter((item) => item.department_id === null)).filter((item) => item.is_enabled && item.day_of_week >= 1 && item.day_of_week <= 6).sort((a, b) => a.display_order - b.display_order)
  const periods = data.periods.filter((item) => item.is_active && (item.department_id === null || item.department_id === section.department_id)).sort((a, b) => a.display_order - b.display_order)
  const entries = data.timetable.filter((item) => item.section_id === section.id && item.is_active && inEffect(item))
  const activeMobileDay = days.some((day) => day.day_of_week === mobileDay) ? mobileDay : days[0]?.day_of_week ?? 1

  return <div className="space-y-6">
    <PageHeader title="My timetable" description="Published timetable from the Admin-configured weekly schedule." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    <Card className="p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><ContextItem label="Academic year" value={year.name} /><ContextItem label="Semester" value={`Semester ${semester.number}`} /><ContextItem label="Year" value={`Year ${section.year_number}`} /><ContextItem label="Section" value={`${section.name}${section.batch ? ` - ${section.batch}` : ''}`} /></div></Card>
    {!days.length ? <EmptyState title="No working days configured" description="The student timetable follows enabled Admin working days." /> : !periods.length ? <EmptyState title="No periods configured" description="Timetable periods are not yet available." /> : !entries.length ? <EmptyState title="No published timetable" description="No active timetable entries are visible for your section yet." /> : <>
      <Card className="hidden lg:block"><StudentDesktopGrid days={days} periods={periods} entries={entries} subjects={data.subjects} profiles={data.profiles} /></Card>
      <Card className="lg:hidden"><div className="grid grid-cols-3 gap-2">{days.map((day) => <Button key={day.id} className="px-2" variant={activeMobileDay === day.day_of_week ? 'primary' : 'secondary'} onClick={() => setMobileDay(day.day_of_week)}>{day.label.slice(0, 3)}</Button>)}</div><div className="mt-4 space-y-3">{periods.map((period) => <StudentPeriodCard key={period.id} day={activeMobileDay} period={period} entry={entries.find((item) => item.day_of_week === activeMobileDay && item.timetable_period_id === period.id)} subjects={data.subjects} profiles={data.profiles} />)}</div></Card>
    </>}
  </div>
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="mt-1 font-bold text-text">{value}</p></div>
}

function StudentDesktopGrid({ days, periods, entries, subjects, profiles }: { days: WorkingDay[]; periods: Period[]; entries: Entry[]; subjects: Subject[]; profiles: Profile[] }) {
  const today = localDay()
  return <div className="overflow-hidden rounded-lg border border-border"><div className="grid" style={{ gridTemplateColumns: `7rem repeat(${periods.length}, minmax(0, 1fr))` }}><div className="border-b border-r bg-background p-3 text-sm font-bold">Day</div>{periods.map((period) => <div key={period.id} className="border-b border-r bg-background p-2 text-center text-xs font-bold"><p>{period.period_number ? `P${period.period_number}` : period.label}</p><p className="font-medium text-muted">{period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}</p></div>)}{days.flatMap((day) => [<div key={`${day.id}-label`} className={`border-b border-r p-3 text-sm font-bold ${day.day_of_week === today ? 'bg-primary/10 text-primary' : ''}`}>{day.label}</div>, ...periods.map((period) => { const entry = entries.find((item) => item.day_of_week === day.day_of_week && item.timetable_period_id === period.id); return <div key={`${day.id}-${period.id}`} className={`min-h-28 border-b border-r p-2 ${day.day_of_week === today ? 'bg-primary/5' : ''} ${day.day_of_week === today && timeActive(period) ? 'outline outline-2 outline-information/50' : ''}`}><StudentEntrySummary period={period} entry={entry} subject={subjects.find((item) => item.id === entry?.subject_id)} profile={profiles.find((item) => item.id === entry?.faculty_id)} /></div> })])}</div></div>
}

function StudentPeriodCard({ day, period, entry, subjects, profiles }: { day: number; period: Period; entry?: Entry; subjects: Subject[]; profiles: Profile[] }) {
  return <article className={`rounded-lg border border-border p-3 ${day === localDay() && timeActive(period) ? 'outline outline-2 outline-information/50' : ''}`}><div className="mb-2 flex items-center justify-between gap-2"><p className="font-bold text-text">{period.period_number ? `Period ${period.period_number}` : period.label}</p><span className="text-xs text-muted">{period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}</span></div><StudentEntrySummary period={period} entry={entry} subject={subjects.find((item) => item.id === entry?.subject_id)} profile={profiles.find((item) => item.id === entry?.faculty_id)} /></article>
}

function StudentEntrySummary({ period, entry, subject, profile }: { period: Period; entry?: Entry; subject?: Subject; profile?: Profile }) {
  if (period.period_type !== 'teaching') return <div className="flex items-center gap-2 text-sm text-muted"><Clock className="size-4" /><span className="font-semibold uppercase">{period.period_type.replace('_', ' ')}</span></div>
  if (!entry) return <p className="text-sm text-muted">No class scheduled</p>
  const lab = Boolean(entry.lab || subject?.subject_type === 'laboratory' || subject?.is_lab)
  return <div className="space-y-2"><div className="flex flex-wrap gap-1"><Badge tone={lab ? 'warning' : 'primary'}>{lab ? 'Lab' : 'Theory'}</Badge></div><p className="text-sm font-bold text-text">{subject?.code ?? 'Subject'} - {subject?.name ?? 'Unknown subject'}</p><p className="flex items-center gap-1 text-xs text-muted"><UserRound className="size-3" />{profile?.full_name ?? 'Faculty not assigned'}</p><p className="flex items-center gap-1 text-xs text-muted"><MapPin className="size-3" />{entry.lab ? `Lab: ${entry.lab}` : `Room: ${entry.room}`}</p><p className="flex items-center gap-1 text-xs text-muted"><CalendarDays className="size-3" />{dayNames[entry.day_of_week]}</p></div>
}

function Field({ label, children }: { label: string; children: import('react').ReactNode }) { return <label className="text-sm font-semibold">{label}<span className="mt-1 block">{children}</span></label> }
