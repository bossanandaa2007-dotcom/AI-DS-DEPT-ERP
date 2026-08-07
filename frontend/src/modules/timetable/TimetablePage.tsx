import { Copy, LayoutGrid, List, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'

import { DataTable } from '@/components/common/DataTable'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { academicRepository, type AcademicData } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'
import { isTeachingStaff } from '@/lib/auth'

type Entry = Database['public']['Tables']['timetable_entries']['Row']
type Draft = { sectionId: string; subjectId: string; facultyId: string; day: string; period: string; start: string; end: string; room: string; lab: string }

const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const workingDays = [1, 2, 3, 4, 5, 6]
/** Times arrive as `HH:MM:SS` but `<input type="time">` works in `HH:MM`. */
const hhmm = (value: string) => value.slice(0, 5)
const fromMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && aEnd > bStart

export function TimetablePage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => academicRepository.loadAcademicData(), [])
  const resource = useAsyncResource(load)
  if (resource.isLoading && !resource.data) return <LoadingState label="Loading timetable…" />
  if (resource.error) return <ErrorState title="Unable to load timetable" description={resource.error} />
  const data = resource.data
  if (!data || !currentUser) return null
  const isDepartmentViewer = currentUser.role === 'super_admin' || currentUser.role === 'hod'
  if (isDepartmentViewer) return <TimetableBuilder data={data} reload={resource.reload} canManage={currentUser.role === 'super_admin'} />
  return <TimetableReadOnly data={data} reload={resource.reload} role={currentUser.role} userId={currentUser.id} />
}

/* ------------------------------------------------------------------ manager */

function TimetableBuilder({ data, reload, canManage }: { data: AcademicData; reload: () => Promise<void>; canManage: boolean }) {
  const [sectionId, setSectionId] = useState(data.sections[0]?.id ?? '')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Entry | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copy, setCopy] = useState({ from: '1', to: '2' })

  const section = data.sections.find((row) => row.id === sectionId)
  const subject = (id: string) => data.subjects.find((row) => row.id === id)
  const facultyName = (id: string | null) => data.profiles.find((row) => row.id === id)?.full_name ?? 'Unassigned'
  const sectionEntries = data.timetable.filter((entry) => entry.section_id === sectionId)
  const entryAt = (day: number, period: number) => sectionEntries.find((entry) => entry.day_of_week === day && entry.period === period)
  const entriesAt = (day: number, period: number) => sectionEntries.filter((entry) => entry.day_of_week === day && entry.period === period)
  const maxPeriod = sectionEntries.reduce((max, entry) => Math.max(max, entry.period), 0)
  const periods = Array.from({ length: Math.max(8, maxPeriod + 1) }, (_, index) => index + 1)

  /** Reuse the times this period already runs at, so the same ladder is not retyped per entry. */
  const periodTimes = (period: number) => {
    const known = sectionEntries.find((entry) => entry.period === period) ?? data.timetable.find((entry) => entry.period === period)
    if (known) return { start: hhmm(known.starts_at), end: hhmm(known.ends_at) }
    const start = 9 * 60 + (period - 1) * 60
    return { start: fromMinutes(start), end: fromMinutes(start + 50) }
  }
  const commonRoom = (() => {
    const tally = new Map<string, number>()
    for (const entry of sectionEntries) tally.set(entry.room, (tally.get(entry.room) ?? 0) + 1)
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  })()

  /** Only Faculty holding an active allocation for this subject and section can be scheduled. */
  const facultyFor = (subjectId: string) => {
    const allowed = new Set(data.assignments.filter((row) => row.is_active && row.section_id === sectionId && row.subject_id === subjectId).map((row) => row.faculty_id))
    return data.profiles.filter((row) => allowed.has(row.id) && row.status === 'active')
  }
  const allocationValid = (subjectId: string, facultyId: string) => facultyFor(subjectId).some((row) => row.id === facultyId)
  /** An entry can outlive its allocation, so keep the stored Faculty selectable and flagged. */
  const orphanedFaculty = draft && draft.facultyId && draft.facultyId === editing?.faculty_id && !allocationValid(draft.subjectId, draft.facultyId) ? draft.facultyId : null
  const sectionSubjects = data.subjects.filter((row) => !section || row.semester_id === section.semester_id)

  const openSlot = (day: number, period: number) => {
    if (!canManage) return
    const existing = entryAt(day, period)
    setMessage('')
    setNotice('')
    if (existing) {
      setEditing(existing)
      setDraft({ sectionId: existing.section_id, subjectId: existing.subject_id, facultyId: existing.faculty_id ?? '', day: String(existing.day_of_week), period: String(existing.period), start: hhmm(existing.starts_at), end: hhmm(existing.ends_at), room: existing.room, lab: existing.lab ?? '' })
    } else {
      const times = periodTimes(period)
      setEditing(null)
      setDraft({ sectionId, subjectId: '', facultyId: '', day: String(day), period: String(period), start: times.start, end: times.end, room: commonRoom, lab: '' })
    }
    setFormOpen(true)
  }

  const chooseSubject = (subjectId: string) => {
    if (!draft) return
    const options = facultyFor(subjectId)
    // One allocation means there is nothing to choose; pre-select it.
    setDraft({ ...draft, subjectId, facultyId: options.length === 1 ? options[0].id : '', lab: subject(subjectId)?.is_lab ? draft.lab : '' })
  }

  const save = async () => {
    if (!canManage) return
    if (!draft) return
    if (!draft.sectionId || !draft.subjectId || !draft.start || !draft.end || !draft.room.trim()) { setMessage('Subject, times, and room are required.'); return }
    if (draft.end <= draft.start) { setMessage('End time must be after the start time.'); return }
    // Keeping an already-stored Faculty is allowed so a stale entry can still be corrected.
    if (draft.facultyId && draft.facultyId !== editing?.faculty_id && !allocationValid(draft.subjectId, draft.facultyId)) { setMessage('Select a Faculty member with an active allocation for this subject and section.'); return }
    setSaving(true); setMessage('')
    const value = { section_id: draft.sectionId, subject_id: draft.subjectId, faculty_id: draft.facultyId || null, day_of_week: Number(draft.day), period: Number(draft.period), starts_at: draft.start, ends_at: draft.end, room: draft.room.trim(), lab: draft.lab.trim() || null }
    try {
      if (editing) await academicRepository.updateTimetableEntry(editing.id, value)
      else await academicRepository.createTimetableEntry(value)
      await reload()
      setFormOpen(false)
      setNotice(`${dayNames[Number(draft.day)]} period ${draft.period} ${editing ? 'updated' : 'scheduled'}.`)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to save this period.')
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!canManage) return
    if (!deleting) return
    try { await academicRepository.deleteTimetableEntry(deleting.id); await reload(); setNotice(`${dayNames[deleting.day_of_week]} period ${deleting.period} cleared.`) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to clear this period.') } finally { setDeleting(null) }
  }

  const runCopy = async () => {
    if (!canManage) return
    const from = Number(copy.from), to = Number(copy.to)
    if (from === to) { setMessage('Choose two different days.'); return }
    const source = sectionEntries.filter((entry) => entry.day_of_week === from)
    if (!source.length) { setMessage(`${dayNames[from]} has no periods to copy.`); return }
    setSaving(true); setMessage('')
    let copied = 0
    const skipped: string[] = []
    for (const entry of source) {
      if (entryAt(to, entry.period)) { skipped.push(`P${entry.period} is already filled`); continue }
      try {
        await academicRepository.createTimetableEntry({ section_id: entry.section_id, subject_id: entry.subject_id, faculty_id: entry.faculty_id, day_of_week: to, period: entry.period, starts_at: entry.starts_at, ends_at: entry.ends_at, room: entry.room, lab: entry.lab })
        copied += 1
      } catch (reason) { skipped.push(`P${entry.period}: ${reason instanceof Error ? reason.message : 'could not be copied'}`) }
    }
    await reload()
    setSaving(false); setCopyOpen(false)
    setNotice(`Copied ${copied} period${copied === 1 ? '' : 's'} to ${dayNames[to]}.${skipped.length ? ` Skipped ${skipped.join('; ')}.` : ''}`)
  }

  const scheduled = sectionEntries.length
  const facultyClash = draft?.facultyId
    ? data.timetable.find((entry) => entry.id !== editing?.id && entry.faculty_id === draft.facultyId && entry.day_of_week === Number(draft.day) && overlaps(hhmm(entry.starts_at), hhmm(entry.ends_at), draft.start, draft.end))
    : undefined

  if (!data.sections.length) return <div className="space-y-6"><PageHeader title="Department weekly timetable" description={canManage ? 'Build the weekly schedule one section at a time.' : 'View the weekly schedule one section at a time.'} /><Card><EmptyState title="No sections yet" description="Create an academic year, semester, and section in Academic Setup before building a timetable." /></Card></div>

  return <div className="space-y-6">
    <PageHeader title="Department weekly timetable" description={canManage ? 'Pick a section, then click any slot in the grid to schedule it.' : 'Pick a year and section to view its weekly timetable exactly as scheduled.'} actions={<div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>{view === 'grid' ? <><List className="size-4" /> List view</> : <><LayoutGrid className="size-4" /> Grid view</>}</Button>
      <Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>
    </div>} />
    {message && !formOpen && !copyOpen && <ErrorState title="Timetable action needs attention" description={message} />}
    {notice && <Card><p className="text-sm font-medium text-success">{notice}</p></Card>}

    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="text-sm font-semibold text-text">Section
          <Select className="mt-1 min-w-64" value={sectionId} onChange={(event) => { setSectionId(event.target.value); setNotice(''); setMessage('') }}>{data.sections.map((row) => { const scheduled = data.timetable.filter((entry) => entry.section_id === row.id).length; return <option key={row.id} value={row.id}>Year {row.year_number} · {row.name} · {scheduled} period{scheduled === 1 ? '' : 's'}</option> })}</Select>
        </label>
        <p className="text-sm text-muted">{scheduled} period{scheduled === 1 ? '' : 's'} scheduled this week</p>
        {canManage && <Button variant="secondary" disabled={!scheduled} onClick={() => { setMessage(''); setCopyOpen(true) }}><Copy className="size-4" /> Copy a day</Button>}
      </div>
    </Card>

    {view === 'grid'
      ? <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] border-separate border-spacing-1.5">
            <thead>
              <tr>
                <th className="w-24" />
                {workingDays.map((day) => <th key={day} className="pb-1 text-xs font-bold uppercase tracking-wide text-muted">{dayNames[day]}</th>)}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const times = periodTimes(period)
                return <tr key={period}>
                  <th className="align-top text-left">
                    <span className="text-sm font-bold text-text">P{period}</span>
                    <span className="block text-[11px] font-normal text-muted">{times.start}–{times.end}</span>
                  </th>
                  {workingDays.map((day) => <td key={day} className="align-top">
                    <SlotCell entries={entriesAt(day, period)} subjectCode={(id) => subject(id)?.code ?? '—'} subjectTitle={(id) => subject(id)?.name ?? 'Unknown subject'} facultyName={facultyName} onOpen={() => openSlot(day, period)} onDelete={setDeleting} canManage={canManage} />
                  </td>)}
                </tr>
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">{canManage ? 'Empty slots are clickable. Times default to the ladder this section already uses.' : 'This is a read-only section timetable view for HOD monitoring.'}</p>
      </Card>
      : <ManagerList data={data} entries={sectionEntries} onEdit={openSlot} onDelete={setDeleting} canManage={canManage} />}

    <Modal isOpen={formOpen} title={editing ? `Edit ${dayNames[Number(draft?.day ?? 1)]} · period ${draft?.period}` : `Schedule ${dayNames[Number(draft?.day ?? 1)]} · period ${draft?.period}`} onClose={() => setFormOpen(false)}>
      {draft && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Subject" full>
            <Select value={draft.subjectId} onChange={(event) => chooseSubject(event.target.value)}>
              <option value="">Select a subject</option>
              {sectionSubjects.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
            </Select>
          </Field>
          <Field label="Faculty" full>
            <Select disabled={!draft.subjectId} value={draft.facultyId} onChange={(event) => setDraft({ ...draft, facultyId: event.target.value })}>
              <option value="">{draft.subjectId ? 'Unassigned' : 'Select a subject first'}</option>
              {facultyFor(draft.subjectId).map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}
              {orphanedFaculty && <option value={orphanedFaculty}>{facultyName(orphanedFaculty)} (allocation inactive)</option>}
            </Select>
            {orphanedFaculty && <span className="mt-1 block text-xs font-normal text-warning">{facultyName(orphanedFaculty)} no longer holds an active allocation for this subject. Keep them for now, or pick an allocated Faculty member.</span>}
            {draft.subjectId && facultyFor(draft.subjectId).length === 0 && !orphanedFaculty && <span className="mt-1 block text-xs font-normal text-warning">No Faculty holds an active allocation for this subject and section. Assign one in Subject Allocation first.</span>}
          </Field>
          <Field label="Start"><Input type="time" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></Field>
          <Field label="End"><Input type="time" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></Field>
          <Field label="Room"><Input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="A-201" /></Field>
          <Field label="Lab (optional)"><Input value={draft.lab} onChange={(event) => setDraft({ ...draft, lab: event.target.value })} placeholder="AI&DS Lab" /></Field>
        </div>
        {facultyClash && <p className="mt-3 text-sm text-warning">{facultyName(draft.facultyId)} already teaches {subject(facultyClash.subject_id)?.code ?? 'another subject'} on {dayNames[facultyClash.day_of_week]} at {hhmm(facultyClash.starts_at)}–{hhmm(facultyClash.ends_at)}. Saving will be rejected.</p>}
        {message && <p className="mt-3 text-sm text-error">{message}</p>}
        <div className="mt-6 flex justify-between gap-3">
          {editing ? <Button variant="danger" disabled={saving} onClick={() => { setFormOpen(false); setDeleting(editing) }}><Trash2 className="size-4" /> Clear slot</Button> : <span />}
          <div className="flex gap-3">
            <Button variant="secondary" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Schedule period'}</Button>
          </div>
        </div>
      </>}
    </Modal>

    <Modal isOpen={copyOpen} title="Copy a day" onClose={() => setCopyOpen(false)}>
      <p className="text-sm text-muted">Copies every scheduled period from one day to another for this section. Slots that are already filled are left untouched.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Copy from"><Select value={copy.from} onChange={(event) => setCopy({ ...copy, from: event.target.value })}>{workingDays.map((day) => <option key={day} value={day}>{dayNames[day]} ({sectionEntries.filter((entry) => entry.day_of_week === day).length})</option>)}</Select></Field>
        <Field label="Copy to"><Select value={copy.to} onChange={(event) => setCopy({ ...copy, to: event.target.value })}>{workingDays.map((day) => <option key={day} value={day}>{dayNames[day]} ({sectionEntries.filter((entry) => entry.day_of_week === day).length})</option>)}</Select></Field>
      </div>
      {message && <p className="mt-3 text-sm text-error">{message}</p>}
      <div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setCopyOpen(false)}>Cancel</Button><Button disabled={saving} onClick={() => void runCopy()}>{saving ? 'Copying…' : 'Copy periods'}</Button></div>
    </Modal>

    <ConfirmDialog isOpen={Boolean(deleting)} title="Clear this period?" description={deleting ? `${dayNames[deleting.day_of_week]} period ${deleting.period} will be removed from the timetable.` : ''} confirmLabel="Clear period" onCancel={() => setDeleting(null)} onConfirm={() => void remove()} />
  </div>
}

/**
 * A slot normally holds one entry, but a batch-split period holds one per batch — II year
 * runs 23CB311 for one batch while the other is in 23AD311. Every entry in the slot is
 * rendered so neither subject is hidden.
 */
function SlotCell({ entries, subjectCode, subjectTitle, facultyName, onOpen, onDelete, canManage }: { entries: Entry[]; subjectCode: (id: string) => string; subjectTitle: (id: string) => string; facultyName: (id: string | null) => string; onOpen: () => void; onDelete: (entry: Entry) => void; canManage: boolean }) {
  if (!entries.length) {
    if (!canManage) return <div className="min-h-[4.5rem] rounded-lg border border-dashed border-border bg-surface/40" />
    return <button type="button" onClick={onOpen} className="flex min-h-[4.5rem] w-full items-center justify-center rounded-lg border border-dashed border-border text-xs font-semibold text-muted transition-colors hover:border-primary hover:bg-background hover:text-primary"><Plus className="size-3" /> Add</button>
  }
  return <div className="space-y-1">
    {entries.map((entry) => <div key={entry.id} className="relative min-h-[4.5rem] rounded-lg border border-border bg-background">
      {canManage ? <button type="button" onClick={onOpen} title={subjectTitle(entry.subject_id)} className="block w-full rounded-lg p-2 pr-7 text-left transition-colors hover:bg-surface">
        <p className="text-xs font-bold text-text">{subjectCode(entry.subject_id)}</p>
        <p className="truncate text-[11px] text-muted">{facultyName(entry.faculty_id)}</p>
        <p className="truncate text-[11px] text-muted">{entry.lab ?? entry.room}</p>
      </button> : <div title={subjectTitle(entry.subject_id)} className="block w-full rounded-lg p-2 text-left">
        <p className="text-xs font-bold text-text">{subjectCode(entry.subject_id)}</p>
        <p className="line-clamp-2 text-[11px] leading-4 text-text/80">{subjectTitle(entry.subject_id)}</p>
        <p className="truncate text-[11px] text-muted">{facultyName(entry.faculty_id)}</p>
        <p className="truncate text-[11px] text-muted">{entry.lab ?? entry.room}</p>
      </div>}
      {canManage && <button type="button" aria-label="Clear period" onClick={() => onDelete(entry)} className="absolute right-1 top-1 rounded p-1 text-muted transition-colors hover:bg-error/10 hover:text-error"><Trash2 className="size-3" /></button>}
    </div>)}
    {entries.length > 1 && <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Batch split</p>}
  </div>
}

function ManagerList({ data, entries, onEdit, onDelete, canManage }: { data: AcademicData; entries: Entry[]; onEdit: (day: number, period: number) => void; onDelete: (entry: Entry) => void; canManage: boolean }) {
  const subject = (id: string) => data.subjects.find((row) => row.id === id)
  const facultyName = (id: string | null) => data.profiles.find((row) => row.id === id)?.full_name ?? 'Unassigned'
  return <Card><DataTable rows={[...entries].sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period)} empty={<EmptyState title="No periods scheduled" description="Switch to grid view and click a slot to schedule this section." />} columns={[
    { header: 'Day / time', render: (entry) => <div><p className="font-semibold">{dayNames[entry.day_of_week]} · P{entry.period}</p><p className="text-xs text-muted">{hhmm(entry.starts_at)} – {hhmm(entry.ends_at)}</p></div> },
    { header: 'Subject', render: (entry) => <div><p className="font-semibold">{subject(entry.subject_id)?.name ?? 'Unknown subject'}</p><p className="text-xs text-muted">{subject(entry.subject_id)?.code ?? '—'}</p></div> },
    { header: 'Faculty', render: (entry) => facultyName(entry.faculty_id) },
    { header: 'Room', render: (entry) => `${entry.room}${entry.lab ? ` · ${entry.lab}` : ''}` },
    ...(canManage ? [{ header: 'Actions', render: (entry: Entry) => <div className="flex gap-1"><Button variant="ghost" className="min-h-8 px-2" onClick={() => onEdit(entry.day_of_week, entry.period)}><Pencil className="size-4" /></Button><Button variant="ghost" className="min-h-8 px-2 text-error" onClick={() => onDelete(entry)}><Trash2 className="size-4" /></Button></div> }] : []),
  ]} /></Card>
}

/* ----------------------------------------------------------------- everyone else */

/**
 * One slot of the read-only grid. A slot usually holds a single entry, but a batch-split
 * period holds one per batch, so every entry is rendered.
 */
function ReadOnlySlot({ entries, subjectOf, facultyName, sectionLabel, showSection }: { entries: Entry[]; subjectOf: (id: string) => { code: string; name: string } | undefined; facultyName: (id: string | null) => string | null; sectionLabel: (id: string) => string; showSection: boolean }) {
  if (!entries.length) return <div className="min-h-[4.5rem] rounded-lg border border-dashed border-border" />
  return <div className="space-y-1.5">
    {entries.map((entry) => {
      const info = subjectOf(entry.subject_id)
      const teacher = facultyName(entry.faculty_id)
      return <div key={entry.id} className="min-h-[4.5rem] rounded-lg border border-border bg-background p-2">
        <p className="text-xs font-bold text-text">{info?.code ?? '—'}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-text/80" title={info?.name}>{info?.name ?? 'Unknown subject'}</p>
        {teacher && <p className="truncate text-[11px] text-muted" title={teacher}>{teacher}</p>}
        <p className="truncate text-[11px] text-muted">{showSection ? `${sectionLabel(entry.section_id)} · ` : ''}{entry.lab ?? entry.room}</p>
      </div>
    })}
    {entries.length > 1 && <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Batch split</p>}
  </div>
}

/** Weekly day-by-period grid, built from whatever days and periods the entries actually use. */
function ReadOnlyGrid({ entries, allEntries, subjectOf, facultyName, sectionLabel, showSection }: { entries: Entry[]; allEntries: Entry[]; subjectOf: (id: string) => { code: string; name: string } | undefined; facultyName: (id: string | null) => string | null; sectionLabel: (id: string) => string; showSection: boolean }) {
  // Keep the week and the period ladder contiguous. A faculty member with no fifth-period
  // class should still see an empty P5 row rather than the grid jumping from P4 to P6, and a
  // free Monday should stay a column. Saturday only appears if something is scheduled on it.
  const usedDays = new Set(entries.map((entry) => entry.day_of_week))
  const lastDay = Math.max(5, ...usedDays)
  const days = Array.from({ length: lastDay }, (_, index) => index + 1)
  const lastPeriod = Math.max(...entries.map((entry) => entry.period))
  const periods = Array.from({ length: lastPeriod }, (_, index) => index + 1)
  // Period times come from this section's own ladder, falling back to any entry at that
  // period so a free row is still labelled with its time.
  const timeOf = (period: number) => {
    const match = entries.find((entry) => entry.period === period) ?? allEntries.find((entry) => entry.period === period)
    return match ? `${hhmm(match.starts_at)}–${hhmm(match.ends_at)}` : ''
  }
  const at = (day: number, period: number) => entries.filter((entry) => entry.day_of_week === day && entry.period === period)

  return <Card>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-separate border-spacing-1.5">
        <thead>
          <tr>
            {/* Pinned so the period and its time stay readable while the week scrolls on a phone. */}
            <th className="sticky left-0 z-10 w-24 bg-surface" />
            {days.map((day) => <th key={day} className="pb-1 text-xs font-bold uppercase tracking-wide text-muted">{dayNames[day]}</th>)}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => <tr key={period}>
            <th className="sticky left-0 z-10 bg-surface pr-2 align-top text-left">
              <span className="text-sm font-bold text-text">P{period}</span>
              <span className="block text-[11px] font-normal text-muted">{timeOf(period)}</span>
            </th>
            {days.map((day) => <td key={day} className="align-top">
              <ReadOnlySlot entries={at(day, period)} subjectOf={subjectOf} facultyName={facultyName} sectionLabel={sectionLabel} showSection={showSection} />
            </td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </Card>
}

function TimetableReadOnly({ data, reload, role, userId }: { data: AcademicData; reload: () => Promise<void>; role: string; userId: string }) {
  const [facultyFilter, setFacultyFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const ownEnrollment = data.enrollments.find((entry) => entry.student_id === userId && entry.status === 'active')
  const visible = data.timetable.filter((entry) => {
    if (role === 'faculty' && entry.faculty_id !== userId) return false
    if (role === 'student' && entry.section_id !== ownEnrollment?.section_id) return false
    if (role === 'lab_assistant' && entry.lab_assistant_id !== userId && !entry.lab) return false
    return (facultyFilter === 'all' || entry.faculty_id === facultyFilter) && (dayFilter === 'all' || String(entry.day_of_week) === dayFilter)
  })
  const subject = (id: string) => data.subjects.find((row) => row.id === id)
  const section = (id: string) => data.sections.find((row) => row.id === id)
  /**
   * `null` means the entry names a faculty member this role may not read, which is not the
   * same as the entry having no faculty. Students can only select their own profile row, so
   * printing "Unassigned" there would claim every class is untaught. The caller omits the
   * line instead.
   */
  const facultyName = (id: string | null) => {
    if (!id) return 'Unassigned'
    return data.profiles.find((row) => row.id === id)?.full_name ?? null
  }
  const activeFaculty = data.profiles.filter((row) => isTeachingStaff(row.role) && row.status === 'active')
  const title = role === 'faculty' ? 'Faculty timetable' : role === 'lab_assistant' ? 'Lab schedule' : 'Student timetable'
  // A student sees one section; faculty and lab assistants see periods across several.
  const showSection = role !== 'student'
  const sectionLabel = (id: string) => { const row = section(id); return row ? `Year ${row.year_number} · ${row.name}` : '—' }
  return <div className="space-y-6">
    <PageHeader title={title} description="Live timetable entries are scoped by your authenticated role and section access." actions={<div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>{view === 'grid' ? <><List className="size-4" /> List view</> : <><LayoutGrid className="size-4" /> Grid view</>}</Button>
      <Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>
    </div>} />
    <Card>
      <div className="grid gap-3 md:grid-cols-2">
        {/* The faculty filter is only useful where faculty names resolve; for a student the
            list is empty until they are allowed to read their department's staff profiles. */}
        {activeFaculty.length > 0 && <Select aria-label="Filter Faculty" value={facultyFilter} onChange={(event) => setFacultyFilter(event.target.value)}><option value="all">All Faculty</option>{activeFaculty.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</Select>}
        <Select aria-label="Filter day" value={dayFilter} onChange={(event) => setDayFilter(event.target.value)}><option value="all">All days</option>{dayNames.slice(1).map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</Select>
      </div>
      <p className="mt-3 text-sm text-muted">{visible.length} period{visible.length === 1 ? '' : 's'} shown</p>
    </Card>

    {visible.length === 0
      ? <Card><EmptyState title="No timetable entries" description="No entries are available for your current access and filters." /></Card>
      : view === 'grid'
        ? <ReadOnlyGrid entries={visible} allEntries={data.timetable} subjectOf={subject} facultyName={facultyName} sectionLabel={sectionLabel} showSection={showSection} />
        : <Card>
      <DataTable rows={[...visible].sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period)} empty={<EmptyState title="No timetable entries" description="No entries are available for your current access and filters." />} columns={[
        { header: 'Day / time', render: (entry) => <div><p className="font-semibold">{dayNames[entry.day_of_week]} · P{entry.period}</p><p className="text-xs text-muted">{hhmm(entry.starts_at)} – {hhmm(entry.ends_at)}</p></div> },
        { header: 'Subject', render: (entry) => <div><p className="font-semibold">{subject(entry.subject_id)?.name ?? 'Unknown subject'}</p><p className="text-xs text-muted">{subject(entry.subject_id)?.code ?? '—'}</p></div> },
        { header: 'Faculty', render: (entry) => facultyName(entry.faculty_id) ?? '—' },
        { header: 'Section / room', render: (entry) => `${section(entry.section_id)?.name ?? '—'} · ${entry.room}${entry.lab ? ` · ${entry.lab}` : ''}` },
      ]} />
        </Card>}
  </div>
}

function Field({ label, children, full = false }: { label: string; children: import('react').ReactNode; full?: boolean }) {
  return <label className={`text-sm font-semibold ${full ? 'sm:col-span-2' : ''}`}>{label}<span className="mt-1 block">{children}</span></label>
}
