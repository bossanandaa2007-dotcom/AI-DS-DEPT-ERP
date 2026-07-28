import { AlertTriangle, Pencil, Power, RefreshCw, Save } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Modal } from '@/components/common/Modal'
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
import { academicRepository } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'

type Entry = Database['public']['Tables']['timetable_entries']['Row']
type Period = Database['public']['Tables']['timetable_periods']['Row']
type Subject = Database['public']['Tables']['subjects']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Allocation = Database['public']['Tables']['faculty_assignments']['Row']
type WorkingDay = Database['public']['Tables']['timetable_working_days']['Row']

type Draft = {
  entry?: Entry
  day: number
  periodId: string
  subjectId: string
  allocationId: string
  facultyId: string
  room: string
  lab: string
  labAssistantId: string
  effectiveFrom: string
  effectiveTo: string
  isActive: boolean
}

const blankDraft = (day: number, periodId: string, effectiveFrom = ''): Draft => ({ day, periodId, subjectId: '', allocationId: '', facultyId: '', room: '', lab: '', labAssistantId: '', effectiveFrom, effectiveTo: '', isActive: true })
const studyYears = [1, 2, 3, 4]
const overlap = (aFrom: string, aTo: string | null | undefined, bFrom: string, bTo: string | null | undefined) => aFrom <= (bTo || '9999-12-31') && bFrom <= (aTo || '9999-12-31')
const clean = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()
const subjectIsLab = (subject?: Subject) => subject?.subject_type === 'laboratory'
const entryHasFinalizedAttendance = (entryId: string, sessions: Database['public']['Tables']['attendance_sessions']['Row'][]) => sessions.some((session) => session.timetable_entry_id === entryId && (session.status === 'finalized' || session.status === 'locked'))
const periodLabel = (period: Period) => `${period.label} (${period.starts_at.slice(0, 5)}-${period.ends_at.slice(0, 5)})`
const defaultPeriods = [
  { label: 'P1', periodNumber: 1, startsAt: '09:00', endsAt: '09:50', displayOrder: 1, periodType: 'teaching' },
  { label: 'P2', periodNumber: 2, startsAt: '09:50', endsAt: '10:40', displayOrder: 2, periodType: 'teaching' },
  { label: 'Break', startsAt: '10:40', endsAt: '10:50', displayOrder: 3, periodType: 'break' },
  { label: 'P3', periodNumber: 3, startsAt: '10:50', endsAt: '11:40', displayOrder: 4, periodType: 'teaching' },
  { label: 'P4', periodNumber: 4, startsAt: '11:40', endsAt: '12:30', displayOrder: 5, periodType: 'teaching' },
  { label: 'Lunch', startsAt: '12:30', endsAt: '13:20', displayOrder: 6, periodType: 'lunch' },
  { label: 'P5', periodNumber: 5, startsAt: '13:20', endsAt: '14:10', displayOrder: 7, periodType: 'teaching' },
  { label: 'P6', periodNumber: 6, startsAt: '14:10', endsAt: '15:00', displayOrder: 8, periodType: 'teaching' },
] satisfies Array<{ label: string; periodNumber?: number; startsAt: string; endsAt: string; displayOrder: number; periodType: Period['period_type'] }>

export function AdminTimetablePage() {
  const { currentUser } = useAuth()
  const resource = useAsyncResource(useCallback(() => academicRepository.loadTimetableData(), []))
  const [academicYearId, setAcademicYearId] = useState('')
  const [semesterId, setSemesterId] = useState('')
  const [studyYear, setStudyYear] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [mobileDay, setMobileDay] = useState(1)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (!currentUser || currentUser.role !== USER_ROLES.superAdmin) return <ErrorState title="Super Admin access required" description="Only the Super Admin can manage timetable entries." />
  if (resource.isLoading) return <LoadingState label="Loading Admin timetable..." />
  if (resource.error) return <div className="space-y-4"><ErrorState title="Unable to load timetable" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  const data = resource.data
  if (!data) return null

  const aiDepartment = findAiDsDepartment(data.departments)
  if (!aiDepartment) return <ErrorState title="Department unavailable" description="Create a department before managing timetable entries." />

  const year = data.academicYears.find((item) => item.id === academicYearId)
  const semester = data.semesters.find((item) => item.id === semesterId)
  const section = data.sections.find((item) => item.id === sectionId)
  const selectedStudyYear = Number(studyYear)
  const academicYears = data.academicYears.filter((item) => item.department_id === aiDepartment.id && item.is_active)
  const semesters = data.semesters.filter((item) => item.academic_year_id === academicYearId && item.is_active)
  const sections = data.sections.filter((item) => item.department_id === aiDepartment.id && item.academic_year_id === academicYearId && item.semester_id === semesterId && item.year_number === selectedStudyYear && item.is_active)
  const departmentDays = data.workingDays.filter((item) => item.department_id === aiDepartment.id)
  const days = (departmentDays.length ? departmentDays : data.workingDays.filter((item) => item.department_id === null)).filter((item) => item.is_enabled).sort((a, b) => a.display_order - b.display_order)
  const periods = data.periods.filter((item) => item.is_active && (item.department_id === null || item.department_id === aiDepartment.id)).sort((a, b) => a.display_order - b.display_order)
  const entries = data.timetable.filter((item) => item.section_id === sectionId)
  const activeEntries = entries.filter((item) => item.is_active)
  const subjects = data.subjects.filter((item) => item.department_id === aiDepartment.id && item.semester_id === semesterId && item.study_year === selectedStudyYear && item.is_active)
  const selectedSubject = data.subjects.find((item) => item.id === draft?.subjectId)
  const allocations = draft ? eligibleAllocations(data.assignments, data.profiles, draft, sectionId, selectedSubject) : []
  const assistants = data.profiles.filter((item) => item.role === 'lab_assistant' && item.status === 'active' && item.department_id === aiDepartment.id)

  const resetAfterYear = (value: string) => { setAcademicYearId(value); setSemesterId(''); setStudyYear(''); setSectionId(''); setMessage(null) }
  const resetAfterSemester = (value: string) => { setSemesterId(value); setStudyYear(''); setSectionId(''); setMessage(null) }
  const resetAfterStudyYear = (value: string) => { setStudyYear(value); setSectionId(''); setMessage(null) }
  const createDefaultPeriods = async () => {
    if (saving) return
    setSaving(true); setMessage(null)
    try {
      await Promise.all(defaultPeriods.map((period) => academicRepository.saveTimetablePeriod({ ...period, departmentId: aiDepartment.id, isActive: true })))
      await resource.reload()
      setMessage({ type: 'success', text: 'Default timetable periods created. You can now add entries.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to create default timetable periods.' })
    } finally {
      setSaving(false)
    }
  }

  const openEntry = (day: number, period: Period, entry?: Entry) => {
    if (period.period_type !== 'teaching') return
    if (entry && entryHasFinalizedAttendance(entry.id, data.attendanceSessions)) {
      setMessage({ type: 'error', text: 'Finalized Attendance references this entry. Create a future replacement instead.' })
      return
    }
    setDraft(entry ? { entry, day, periodId: period.id, subjectId: entry.subject_id, allocationId: entry.allocation_id ?? '', facultyId: entry.faculty_id ?? '', room: entry.lab ? '' : entry.room, lab: entry.lab ?? '', labAssistantId: entry.lab_assistant_id ?? '', effectiveFrom: entry.effective_from, effectiveTo: entry.effective_to ?? '', isActive: entry.is_active } : blankDraft(day, period.id, year?.starts_on ?? ''))
    setMessage(null)
  }

  const validate = (candidate: Draft) => {
    const period = periods.find((item) => item.id === candidate.periodId)
    const subject = subjects.find((item) => item.id === candidate.subjectId)
    const allocation = data.assignments.find((item) => item.id === candidate.allocationId)
    if (!year || !year.is_active || year.department_id !== aiDepartment.id) return 'Select an active Academic Year.'
    if (!semester || !semester.is_active || semester.academic_year_id !== year.id) return 'Select an active Semester for the Academic Year.'
    if (!studyYears.includes(selectedStudyYear)) return 'Select Study Year 1, 2, 3, or 4.'
    if (!section || !section.is_active || section.academic_year_id !== year.id || section.semester_id !== semester.id || section.year_number !== selectedStudyYear) return 'Select a compatible active Section.'
    if (!period || period.period_type !== 'teaching') return 'Break, lunch, and non-teaching periods cannot receive timetable entries.'
    if (!subject || subject.department_id !== aiDepartment.id || subject.semester_id !== semester.id || subject.study_year !== selectedStudyYear) return 'Select an active Subject matching the academic context.'
    if (!allocation || !allocation.is_active || allocation.section_id !== section.id || allocation.subject_id !== subject.id || allocation.faculty_id !== candidate.facultyId) return 'Select Faculty from active Subject allocations for this Section.'
    if (allocation.effective_from > candidate.effectiveFrom || (allocation.effective_to && (!candidate.effectiveTo || candidate.effectiveTo > allocation.effective_to))) return 'The selected Faculty allocation does not cover the effective dates.'
    if (!candidate.effectiveFrom || (candidate.effectiveTo && candidate.effectiveTo < candidate.effectiveFrom)) return 'Enter valid effective dates.'
    if (subjectIsLab(subject)) {
      if (!candidate.lab.trim()) return 'Laboratory is required for laboratory Subjects.'
    } else if (!candidate.room.trim()) return 'Room is required for non-laboratory Subjects.'
    if (!subjectIsLab(subject) && (candidate.lab.trim() || candidate.labAssistantId)) return 'Laboratory and Lab Assistant are allowed only for laboratory Subjects.'
    if (candidate.entry && entryHasFinalizedAttendance(candidate.entry.id, data.attendanceSessions)) return 'Finalized Attendance references this entry. Create a future replacement instead.'
    if (candidate.isActive) {
      const conflicts = data.timetable.filter((entry) => entry.id !== candidate.entry?.id && entry.is_active && entry.day_of_week === candidate.day && entry.timetable_period_id === candidate.periodId && overlap(entry.effective_from, entry.effective_to, candidate.effectiveFrom, candidate.effectiveTo))
      if (conflicts.some((entry) => entry.section_id === section.id)) return 'This Section already has an entry during the selected period.'
      if (conflicts.some((entry) => entry.faculty_id === candidate.facultyId)) return 'The selected Faculty is already assigned during this period.'
      if (candidate.room.trim() && conflicts.some((entry) => clean(entry.room) === clean(candidate.room))) return 'The selected Room is already in use during this period.'
      if (candidate.lab.trim() && conflicts.some((entry) => clean(entry.lab) === clean(candidate.lab))) return 'The selected Laboratory is already in use during this period.'
      if (candidate.labAssistantId && conflicts.some((entry) => entry.lab_assistant_id === candidate.labAssistantId)) return 'The selected Lab Assistant is already assigned during this period.'
    }
    return ''
  }

  const save = async () => {
    if (!draft || saving) return
    const validation = validate(draft)
    if (validation) { setMessage({ type: 'error', text: validation }); return }
    setSaving(true); setMessage(null)
    try {
      await academicRepository.saveTimetableEntry({ entryId: draft.entry?.id, sectionId, subjectId: draft.subjectId, facultyId: draft.facultyId, allocationId: draft.allocationId, periodId: draft.periodId, dayOfWeek: draft.day, room: draft.room, lab: draft.lab || undefined, labAssistantId: draft.labAssistantId || undefined, effectiveFrom: draft.effectiveFrom, effectiveTo: draft.effectiveTo || undefined, isActive: draft.isActive })
      await resource.reload()
      setDraft(null)
      setMessage({ type: 'success', text: 'Timetable entry saved.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save timetable entry.' })
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async () => {
    if (!draft?.entry || saving) return
    if (entryHasFinalizedAttendance(draft.entry.id, data.attendanceSessions)) {
      setMessage({ type: 'error', text: 'Finalized Attendance references this entry. Create a future replacement instead.' })
      return
    }
    setSaving(true); setMessage(null)
    try {
      await academicRepository.deactivateTimetableEntry(draft.entry.id)
      await resource.reload()
      setDraft(null)
      setMessage({ type: 'success', text: 'Timetable entry deactivated. History is preserved.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to deactivate timetable entry.' })
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-6">
    <PageHeader title="Admin Timetable" description="Create and maintain AI-DS weekly timetable entries by Academic Year, Semester, Study Year, and Section." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    {message && <p className={`rounded-lg border p-3 text-sm ${message.type === 'success' ? 'border-success/30 bg-success/5 text-success' : 'border-error/30 bg-error/5 text-error'}`}>{message.text}</p>}
    <Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Select value={academicYearId} onChange={(event) => resetAfterYear(event.target.value)}><option value="">Academic Year</option>{academicYears.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <Select value={semesterId} onChange={(event) => resetAfterSemester(event.target.value)}><option value="">Semester</option>{semesters.map((item) => <option key={item.id} value={item.id}>Semester {item.number}</option>)}</Select>
        <Select value={studyYear} onChange={(event) => resetAfterStudyYear(event.target.value)}><option value="">Study Year</option>{studyYears.map((item) => <option key={item} value={item}>Year {item}</option>)}</Select>
        <Select value={sectionId} onChange={(event) => { setSectionId(event.target.value); setMessage(null) }}><option value="">Section</option>{sections.map((item) => <option key={item.id} value={item.id}>{item.name}{item.batch ? ` - ${item.batch}` : ''}</option>)}</Select>
      </div>
      {!sectionId ? <div className="mt-5"><EmptyState title="Select an academic context" description="Choose Academic Year, Semester, Study Year, and Section to load the weekly grid." /></div> : !days.length ? <div className="mt-5"><EmptyState title="No working days configured" description="Enable working days before adding timetable entries." /></div> : !periods.length ? <div className="mt-5 space-y-4"><EmptyState title="No timetable periods configured" description="Create default periods before adding timetable entries." /><Button disabled={saving} onClick={() => void createDefaultPeriods()}>{saving ? 'Creating...' : 'Create default periods'}</Button></div> : <>
        <div className="mt-5 hidden overflow-x-auto lg:block"><TimetableGrid days={days} periods={periods} entries={activeEntries} subjects={data.subjects} profiles={data.profiles} attendanceSessions={data.attendanceSessions} onOpen={openEntry} /></div>
        <div className="mt-5 lg:hidden"><MobileTimetable days={days} periods={periods} entries={activeEntries} subjects={data.subjects} profiles={data.profiles} attendanceSessions={data.attendanceSessions} selectedDay={mobileDay} onSelectDay={setMobileDay} onOpen={openEntry} /></div>
      </>}
    </Card>
    <Modal isOpen={Boolean(draft)} title={draft?.entry ? 'Edit timetable entry' : 'Add timetable entry'} onClose={() => setDraft(null)}>{draft && <EntryForm draft={draft} setDraft={setDraft} subjects={subjects} allocations={allocations} profiles={data.profiles} assistants={assistants} selectedSubject={selectedSubject} saving={saving} locked={Boolean(draft.entry && entryHasFinalizedAttendance(draft.entry.id, data.attendanceSessions))} onSave={save} onDeactivate={deactivate} onClose={() => setDraft(null)} />}</Modal>
  </div>
}

function eligibleAllocations(assignments: Allocation[], profiles: Profile[], draft: Draft, sectionId: string, subject?: Subject) {
  return assignments.filter((item) => {
    const faculty = profiles.find((profile) => profile.id === item.faculty_id)
    return item.is_active
      && item.section_id === sectionId
      && item.subject_id === draft.subjectId
      && (item.assignment_type === 'subject_faculty' || (subjectIsLab(subject) && item.assignment_type === 'lab_faculty'))
      && item.effective_from <= (draft.effectiveFrom || '9999-12-31')
      && (!item.effective_to || !draft.effectiveTo || draft.effectiveTo <= item.effective_to)
      && faculty?.role === 'faculty'
      && faculty.status === 'active'
  })
}

function TimetableGrid({ days, periods, entries, subjects, profiles, attendanceSessions, onOpen }: { days: WorkingDay[]; periods: Period[]; entries: Entry[]; subjects: Subject[]; profiles: Profile[]; attendanceSessions: Database['public']['Tables']['attendance_sessions']['Row'][]; onOpen: (day: number, period: Period, entry?: Entry) => void }) {
  return <div className="min-w-[64rem] overflow-hidden rounded-xl border border-border"><div className="grid" style={{ gridTemplateColumns: `9rem repeat(${periods.length}, minmax(9rem, 1fr))` }}><div className="border-b border-r border-border bg-background p-3 text-sm font-bold">Day</div>{periods.map((period) => <div key={period.id} className="border-b border-r border-border bg-background p-3 text-center text-sm font-bold"><p>{period.label}</p><p className="text-xs font-medium text-muted">{period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}</p></div>)}{days.flatMap((day) => [<div key={`${day.id}-day`} className="border-b border-r border-border p-3 font-semibold">{day.label}</div>, ...periods.map((period) => { const entry = entries.find((item) => item.day_of_week === day.day_of_week && item.timetable_period_id === period.id); return <GridCell key={`${day.id}-${period.id}`} day={day.day_of_week} period={period} entry={entry} subject={subjects.find((item) => item.id === entry?.subject_id)} profile={profiles.find((item) => item.id === entry?.faculty_id)} locked={Boolean(entry && entryHasFinalizedAttendance(entry.id, attendanceSessions))} onOpen={onOpen} /> })])}</div></div>
}

function MobileTimetable({ days, periods, entries, subjects, profiles, attendanceSessions, selectedDay, onSelectDay, onOpen }: { days: WorkingDay[]; periods: Period[]; entries: Entry[]; subjects: Subject[]; profiles: Profile[]; attendanceSessions: Database['public']['Tables']['attendance_sessions']['Row'][]; selectedDay: number; onSelectDay: (day: number) => void; onOpen: (day: number, period: Period, entry?: Entry) => void }) {
  return <div><div className="mb-3 flex gap-2 overflow-x-auto pb-1">{days.map((day) => <Button key={day.id} variant={selectedDay === day.day_of_week ? 'primary' : 'secondary'} onClick={() => onSelectDay(day.day_of_week)}>{day.label.slice(0, 3)}</Button>)}</div><div className="space-y-2">{periods.map((period) => { const entry = entries.find((item) => item.day_of_week === selectedDay && item.timetable_period_id === period.id); return <button key={period.id} disabled={period.period_type !== 'teaching'} onClick={() => onOpen(selectedDay, period, entry)} className="w-full rounded-lg border border-border bg-surface p-3 text-left disabled:bg-background"><p className="font-semibold text-text">{periodLabel(period)}</p><EntrySummary period={period} entry={entry} subject={subjects.find((item) => item.id === entry?.subject_id)} profile={profiles.find((item) => item.id === entry?.faculty_id)} locked={Boolean(entry && entryHasFinalizedAttendance(entry.id, attendanceSessions))} /></button> })}</div></div>
}

function GridCell({ day, period, entry, subject, profile, locked, onOpen }: { day: number; period: Period; entry?: Entry; subject?: Subject; profile?: Profile; locked: boolean; onOpen: (day: number, period: Period, entry?: Entry) => void }) {
  return <button disabled={period.period_type !== 'teaching'} onClick={() => onOpen(day, period, entry)} className="min-h-28 border-b border-r border-border p-2 text-left transition hover:bg-background disabled:bg-background"><EntrySummary period={period} entry={entry} subject={subject} profile={profile} locked={locked} /></button>
}

function EntrySummary({ period, entry, subject, profile, locked }: { period: Period; entry?: Entry; subject?: Subject; profile?: Profile; locked: boolean }) {
  if (period.period_type !== 'teaching') return <Badge>{period.period_type.replace('_', ' ')}</Badge>
  if (!entry) return <span className="text-sm text-muted">Add entry</span>
  return <div className="space-y-1"><div className="flex flex-wrap gap-1">{locked && <Badge tone="warning">Attendance locked</Badge>}<Badge tone={subjectIsLab(subject) ? 'warning' : 'primary'}>{subjectIsLab(subject) ? 'Lab' : 'Theory'}</Badge></div><p className="text-sm font-semibold text-text">{subject?.code ?? 'Subject'} - {subject?.name ?? 'Unknown'}</p><p className="text-xs text-muted">{profile?.full_name ?? 'Faculty'} - {profile?.employee_or_register_number ?? 'Employee ID unavailable'}</p><p className="text-xs text-muted">{entry.lab ? `Lab: ${entry.lab}` : `Room: ${entry.room}`}</p><p className="text-xs text-muted">{entry.effective_from} to {entry.effective_to ?? 'open ended'}</p></div>
}

function EntryForm({ draft, setDraft, subjects, allocations, profiles, assistants, selectedSubject, saving, locked, onSave, onDeactivate, onClose }: { draft: Draft; setDraft: (value: Draft) => void; subjects: Subject[]; allocations: Allocation[]; profiles: Profile[]; assistants: Profile[]; selectedSubject?: Subject; saving: boolean; locked: boolean; onSave: () => void; onDeactivate: () => void; onClose: () => void }) {
  const update = (value: Partial<Draft>) => setDraft({ ...draft, ...value })
  const labSubject = subjectIsLab(selectedSubject)
  return <div className="space-y-4">
    {locked && <p className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning"><AlertTriangle className="size-4" /> Finalized Attendance references this entry. Create a future replacement instead.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Subject"><Select value={draft.subjectId} disabled={locked} onChange={(event) => update({ subjectId: event.target.value, allocationId: '', facultyId: '', lab: '', labAssistantId: '' })}><option value="">Select Subject</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name} ({item.subject_type.replace('_', ' ')})</option>)}</Select></Field>
      <Field label="Allocated Faculty"><Select value={draft.allocationId} disabled={locked || !draft.subjectId} onChange={(event) => { const allocation = allocations.find((item) => item.id === event.target.value); update({ allocationId: event.target.value, facultyId: allocation?.faculty_id ?? '' }) }}><option value="">Select allocated Faculty</option>{allocations.map((item) => { const profile = profiles.find((candidate) => candidate.id === item.faculty_id); return <option key={item.id} value={item.id}>{profile?.full_name ?? 'Faculty'} - {profile?.employee_or_register_number ?? 'Employee ID unavailable'} ({item.assignment_type.replace('_', ' ')})</option> })}</Select></Field>
      {!labSubject && <Field label="Room"><Input value={draft.room} disabled={locked} onChange={(event) => update({ room: event.target.value })} /></Field>}
      {labSubject && <Field label="Laboratory"><Input value={draft.lab} disabled={locked} onChange={(event) => update({ lab: event.target.value, room: '' })} /></Field>}
      {labSubject && <Field label="Lab Assistant"><Select value={draft.labAssistantId} disabled={locked} onChange={(event) => update({ labAssistantId: event.target.value })}><option value="">No Lab Assistant</option>{assistants.map((item) => <option key={item.id} value={item.id}>{item.full_name} - {item.employee_or_register_number ?? 'Employee ID unavailable'}</option>)}</Select></Field>}
      <Field label="Effective From"><Input type="date" value={draft.effectiveFrom} disabled={locked} onChange={(event) => update({ effectiveFrom: event.target.value, allocationId: '', facultyId: '' })} /></Field>
      <Field label="Effective To"><Input type="date" value={draft.effectiveTo} disabled={locked} onChange={(event) => update({ effectiveTo: event.target.value, allocationId: '', facultyId: '' })} /></Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-text"><input type="checkbox" checked={draft.isActive} disabled={locked} onChange={(event) => update({ isActive: event.target.checked })} /> Active</label>
    </div>
    <div className="flex flex-wrap justify-between gap-3">
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <div className="flex flex-wrap gap-2">{draft.entry && <Button variant="danger" disabled={saving || locked || !draft.entry.is_active} onClick={onDeactivate}><Power className="size-4" /> Deactivate</Button>}<Button disabled={saving || locked} onClick={onSave}>{saving ? <><Save className="size-4" /> Saving...</> : <><Pencil className="size-4" /> Save entry</>}</Button></div>
    </div>
  </div>
}

function Field({ label, children }: { label: string; children: import('react').ReactNode }) {
  return <label className="block text-sm font-semibold text-text">{label}<span className="mt-1 block">{children}</span></label>
}
