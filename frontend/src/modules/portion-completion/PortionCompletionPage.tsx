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
import { useAuth } from '@/modules/auth/useAuth'
import { departmentOperationsRepository } from '@/services/supabase/departmentOperationsRepository'

export function PortionCompletionPage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => departmentOperationsRepository.load(), [])
  const resource = useAsyncResource(load)
  const [timetableId, setTimetableId] = useState('')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ unit: 'Unit 1', plannedTopic: '', completedTopic: '', completionPercentage: 0, nextTopic: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  if (resource.isLoading) return <LoadingState label="Loading live portion progress…" />
  if (resource.error || !resource.data || !currentUser) return <div className="space-y-3"><ErrorState title="Portion progress unavailable" description={resource.error ?? 'Your session is unavailable.'} /><Button variant="secondary" onClick={() => void resource.reload()}>Retry</Button></div>

  const { portions, assignments, timetable } = resource.data
  const facultyTimetable = timetable.filter((entry) => entry.faculty_id === currentUser.id && assignments.some((assignment) => assignment.subjectId === entry.subject_id && assignment.sectionId === entry.section_id))
  const selectedTimetable = facultyTimetable.find((entry) => entry.id === timetableId)
  const labelFor = (subjectId: string, sectionId: string) => assignments.find((assignment) => assignment.subjectId === subjectId && assignment.sectionId === sectionId)?.label ?? `${subjectId} · ${sectionId}`
  const filtered = portions.filter((item) => `${labelFor(item.subject_id, item.section_id)} ${item.unit} ${item.completed_topic}`.toLowerCase().includes(query.toLowerCase()))
  const save = async () => {
    setError(''); setSuccess('')
    if (!selectedTimetable) { setError('Select one of your assigned timetable entries.'); return }
    setSaving(true)
    try {
      await departmentOperationsRepository.savePortion({ timetableEntryId: selectedTimetable.id, subjectId: selectedTimetable.subject_id, sectionId: selectedTimetable.section_id, ...form })
      await resource.reload(); setSuccess('Portion progress saved. An update for the same timetable entry and unit is updated rather than duplicated.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save portion progress.') } finally { setSaving(false) }
  }
  const isFaculty = currentUser.role === USER_ROLES.faculty
  return <div className="space-y-6"><PageHeader title="Portion completion" description={isFaculty ? 'Record progress only for your active subject assignments.' : 'Department overview of syllabus progress from live portion updates.'} />{(error || success) && <div className="space-y-3">{error && <ErrorState title="Portion update needs attention" description={error} />}{success && <div role="status" className="rounded-xl border border-success/30 bg-success/5 p-4 text-sm font-medium text-text">{success}</div>}</div>}{isFaculty && <Card><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">Assigned timetable entry<Select className="mt-1" value={timetableId} onChange={(event) => setTimetableId(event.target.value)}><option value="">Select an assigned entry</option>{facultyTimetable.map((entry) => <option key={entry.id} value={entry.id}>{labelFor(entry.subject_id, entry.section_id)} · Day {entry.day_of_week}, period {entry.period}</option>)}</Select></label><label className="text-sm font-semibold">Unit<Input className="mt-1" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label><label className="text-sm font-semibold">Planned topic<Input className="mt-1" value={form.plannedTopic} onChange={(event) => setForm({ ...form, plannedTopic: event.target.value })} /></label><label className="text-sm font-semibold">Completed topic<Input className="mt-1" value={form.completedTopic} onChange={(event) => setForm({ ...form, completedTopic: event.target.value })} /></label><label className="text-sm font-semibold">Completion %<Input className="mt-1" type="number" min="0" max="100" value={form.completionPercentage} onChange={(event) => setForm({ ...form, completionPercentage: Number(event.target.value) })} /></label><label className="text-sm font-semibold">Next topic<Input className="mt-1" value={form.nextTopic} onChange={(event) => setForm({ ...form, nextTopic: event.target.value })} /></label></div><div className="mt-5 flex justify-end"><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save update'}</Button></div></Card>}<Card><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-text">Syllabus progress</h2><p className="text-sm text-muted">Update dates are provided by the database.</p></div><Input className="sm:max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject, unit, or topic" /></div><div className="mt-4"><DataTable rows={filtered} empty={<EmptyState title="No portion updates match the current view" />} columns={[{ header: 'Subject / unit', render: (item) => <div><p className="font-semibold">{labelFor(item.subject_id, item.section_id)}</p><p className="text-xs text-muted">{item.unit}</p></div> }, { header: 'Completed topic', render: (item) => <div className="max-w-sm whitespace-normal"><p>{item.completed_topic}</p><p className="text-xs text-muted">Planned: {item.planned_topic}</p></div> }, { header: 'Progress', render: (item) => <Badge tone={Number(item.completion_percentage) >= 75 ? 'success' : 'warning'}>{item.completion_percentage}%</Badge> }, { header: 'Next / updated', render: (item) => <div className="text-xs"><p>{item.next_topic ?? '—'}</p><p className="text-muted">{new Date(item.updated_at).toLocaleString()}</p></div> }]} /></div></Card></div>
}
