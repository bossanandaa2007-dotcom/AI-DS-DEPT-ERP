import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { DataTable } from '@/components/common/DataTable'
import { Modal } from '@/components/common/Modal'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { EmptyState } from '@/components/feedback/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { academicRepository, type AcademicData } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'
import { isTeachingStaff } from '@/lib/auth'

type Assignment = Database['public']['Tables']['faculty_assignments']['Row']
type AssignmentType = Database['public']['Enums']['assignment_type']
const allTypes: AssignmentType[] = ['subject_faculty', 'lab_faculty', 'class_teacher', 'faculty_guide']
const needsSubject = (type: AssignmentType) => type === 'subject_faculty' || type === 'lab_faculty'
const readable = (value: string) => value.replaceAll('_', ' ')

interface PanelProps { data: AcademicData; reload: () => Promise<void>; canManage?: boolean }

/**
 * Every allocation ever recorded, active or not. The active flag is shown explicitly because a
 * deactivated allocation still leaves timetable entries and assessments pointing at that Faculty
 * member, and those workflows then refuse to run.
 */
export function AllocationDirectory({ data, reload, canManage = true }: PanelProps) {
  const [facultyFilter, setFacultyFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [editing, setEditing] = useState<Assignment | null>(null)
  const [creating, setCreating] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Assignment | null>(null)
  const [draft, setDraft] = useState({ facultyId: '', subjectId: '', sectionId: '', type: 'subject_faculty' as AssignmentType })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const activeFaculty = data.profiles.filter((profile) => profile.role === 'faculty' && profile.status === 'active')
  const name = (id: string) => data.profiles.find((profile) => profile.id === id)?.full_name ?? 'Unknown Faculty'
  const section = (id: string) => data.sections.find((item) => item.id === id)
  const subject = (id: string | null) => data.subjects.find((item) => item.id === id)
  const visible = data.assignments.filter((item) =>
    (statusFilter === 'all' || (statusFilter === 'active' ? item.is_active : !item.is_active)) &&
    (facultyFilter === 'all' || item.faculty_id === facultyFilter) &&
    (subjectFilter === 'all' || item.subject_id === subjectFilter) &&
    (sectionFilter === 'all' || item.section_id === sectionFilter))
  const inactiveCount = data.assignments.filter((item) => !item.is_active).length

  const openCreate = () => { if (!canManage) return; setCreating(true); setEditing(null); setMessage(''); setDraft({ facultyId: '', subjectId: '', sectionId: data.sections[0]?.id ?? '', type: 'subject_faculty' }) }
  const openEdit = (item: Assignment) => { if (!canManage) return; setEditing(item); setCreating(false); setMessage(''); setDraft({ facultyId: item.faculty_id, subjectId: item.subject_id ?? '', sectionId: item.section_id, type: item.assignment_type }) }
  const close = () => { setEditing(null); setCreating(false); setMessage('') }

  const save = async () => {
    if (!canManage) return
    const selected = section(draft.sectionId)
    if (!draft.facultyId || !selected) { setMessage('Select an active Faculty member and a section.'); return }
    if (needsSubject(draft.type) && !draft.subjectId) { setMessage('This responsibility requires a subject.'); return }
    setSaving(true); setMessage('')
    const value = { faculty_id: draft.facultyId, section_id: selected.id, subject_id: needsSubject(draft.type) ? draft.subjectId : null, academic_year_id: selected.academic_year_id, semester_id: selected.semester_id, assignment_type: draft.type }
    try {
      if (editing) await academicRepository.updateFacultyAssignment(editing.id, value)
      else await academicRepository.createFacultyAssignment({ ...value, is_active: true })
      await reload(); close(); setNotice(editing ? 'Allocation updated.' : 'Allocation created.')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to save this allocation.') } finally { setSaving(false) }
  }
  const deactivate = async () => {
    if (!canManage) return
    if (!removeTarget) return
    setSaving(true)
    try { await academicRepository.deactivateFacultyAssignment(removeTarget.id); await reload(); setNotice('Allocation deactivated.') } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to deactivate this allocation.') } finally { setSaving(false); setRemoveTarget(null) }
  }
  const reactivate = async (item: Assignment) => {
    if (!canManage) return
    setSaving(true); setNotice('')
    try { await academicRepository.updateFacultyAssignment(item.id, { is_active: true }); await reload(); setNotice(`${name(item.faculty_id)} reactivated for ${subject(item.subject_id)?.code ?? readable(item.assignment_type)}.`) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to reactivate this allocation.') } finally { setSaving(false) }
  }

  return <Card>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-bold text-text">All allocations</h2>
        <p className="mt-1 text-sm text-muted">Includes every responsibility type. {inactiveCount > 0 ? `${inactiveCount} deactivated allocation${inactiveCount === 1 ? '' : 's'} on record.` : 'No deactivated allocations.'}</p>
      </div>
      {canManage && <Button onClick={openCreate}><Plus className="size-4" /> New allocation</Button>}
    </div>
    {notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Filter value={statusFilter} setValue={(value) => setStatusFilter(value as typeof statusFilter)} label="Active only" rows={[{ id: 'inactive', label: 'Deactivated only' }, { id: 'all', label: 'Active and deactivated' }]} allValue="active" />
      <Filter value={facultyFilter} setValue={setFacultyFilter} label="All Faculty" rows={activeFaculty.map((row) => ({ id: row.id, label: row.full_name }))} />
      <Filter value={subjectFilter} setValue={setSubjectFilter} label="All subjects" rows={data.subjects.map((row) => ({ id: row.id, label: `${row.code} · ${row.name}` }))} />
      <Filter value={sectionFilter} setValue={setSectionFilter} label="All sections" rows={data.sections.map((row) => ({ id: row.id, label: `Year ${row.year_number} · ${row.name}` }))} />
    </div>
    <div className="mt-4"><DataTable rows={visible} empty={<EmptyState title="No allocations match these filters" />} columns={[
      { header: 'Faculty', render: (item) => <div><p className="font-semibold">{name(item.faculty_id)}</p><p className="text-xs text-muted">{section(item.section_id)?.name ?? '—'} · {data.semesters.find((row) => row.id === item.semester_id)?.name ?? '—'}</p></div> },
      { header: 'Subject', render: (item) => item.subject_id ? <div><p>{subject(item.subject_id)?.name ?? 'Unknown subject'}</p><p className="text-xs text-muted">{subject(item.subject_id)?.code ?? '—'}</p></div> : <span className="text-muted">Not applicable</span> },
      { header: 'Responsibility', render: (item) => <Badge tone="primary">{readable(item.assignment_type)}</Badge> },
      { header: 'Status', render: (item) => <Badge tone={item.is_active ? 'success' : 'warning'}>{item.is_active ? 'Active' : 'Deactivated'}</Badge> },
      { header: 'Jury', render: (item) => item.is_jury_eligible ? <Badge tone="success">Eligible</Badge> : <span className="text-muted">—</span> },
      ...(canManage ? [{ header: 'Actions', render: (item: Assignment) => <div className="flex gap-1">
        {item.is_active
          ? <><Button className="min-h-8" variant="ghost" onClick={() => openEdit(item)}><Pencil className="size-4" /></Button><Button className="min-h-8 text-error" variant="ghost" onClick={() => setRemoveTarget(item)}><Trash2 className="size-4" /></Button></>
          : <Button className="min-h-8" variant="secondary" disabled={saving} onClick={() => void reactivate(item)}><RotateCcw className="size-4" /> Reactivate</Button>}
      </div> },
      ] : []),
    ]} /></div>

    <Modal isOpen={creating || Boolean(editing)} title={editing ? 'Edit allocation' : 'New allocation'} onClose={close}>
      <div className="space-y-3">
        <Field label="Faculty"><Select value={draft.facultyId} onChange={(event) => setDraft({ ...draft, facultyId: event.target.value })}><option value="">Select active Faculty</option>{activeFaculty.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</Select></Field>
        <Field label="Responsibility"><Select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as AssignmentType })}>{allTypes.map((value) => <option key={value} value={value}>{readable(value)}</option>)}</Select></Field>
        <Field label="Section"><Select value={draft.sectionId} onChange={(event) => setDraft({ ...draft, sectionId: event.target.value, subjectId: '' })}><option value="">Select section</option>{data.sections.map((row) => <option key={row.id} value={row.id}>Year {row.year_number} · {row.name}</option>)}</Select></Field>
        {needsSubject(draft.type) && <Field label="Subject"><Select value={draft.subjectId} onChange={(event) => setDraft({ ...draft, subjectId: event.target.value })}><option value="">Select subject</option>{data.subjects.filter((row) => row.semester_id === section(draft.sectionId)?.semester_id).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</Select></Field>}
        {draft.type === 'class_teacher' && <p className="text-xs text-warning">A section may have only one active Class Teacher. Use the Class Teacher control on the section board to replace the current one safely.</p>}
      </div>
      {message && <p role="alert" className="mt-3 text-sm text-error">{message}</p>}
      <div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={close}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : editing ? 'Save allocation' : 'Create allocation'}</Button></div>
    </Modal>

    <ConfirmDialog isOpen={Boolean(removeTarget)} title="Deactivate this allocation?" description="History is preserved and the allocation can be reactivated later. Timetable periods and assessments already pointing at this Faculty member will stop accepting attendance and marks until reallocated." confirmLabel="Deactivate" onCancel={() => setRemoveTarget(null)} onConfirm={() => void deactivate()} />
  </Card>
}

export function ProjectGuidePanel({ data, reload, canManage = true }: PanelProps) {
  const [projectId, setProjectId] = useState('')
  const [facultyId, setFacultyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const activeFaculty = data.profiles.filter((row) => isTeachingStaff(row.role) && row.status === 'active')
  const save = async () => {
    if (!canManage) return
    if (!projectId) { setMessage('Select a project.'); return }
    setSaving(true); setMessage('')
    try { await academicRepository.setProjectFacultyGuide(projectId, facultyId || null); await reload(); setMessage(facultyId ? 'Faculty Guide assigned.' : 'Faculty Guide removed.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update Faculty Guide.') } finally { setSaving(false) }
  }
  return <Card>
    <h2 className="font-bold text-text">Project Faculty Guides</h2>
    <p className="mt-1 text-sm text-muted">Guides recorded against each project, separate from section responsibilities.</p>
    {message && <p role={message.includes('assigned') || message.includes('removed') ? 'status' : 'alert'} className={`mt-3 text-sm ${message.includes('assigned') || message.includes('removed') ? 'text-success' : 'text-error'}`}>{message}</p>}
    {canManage && <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <Filter value={projectId} setValue={(value) => { setProjectId(value); setFacultyId(data.projects.find((row) => row.id === value)?.faculty_guide_id ?? '') }} label="Select project" rows={data.projects.map((row) => ({ id: row.id, label: row.name }))} />
      <Filter value={facultyId} setValue={setFacultyId} label="No guide / remove guide" rows={activeFaculty.map((row) => ({ id: row.id, label: row.full_name }))} />
      <Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save guide'}</Button>
    </div>}
    <div className="mt-4"><DataTable rows={data.projects} empty={<EmptyState title="No projects available for guide assignment" />} columns={[
      { header: 'Project', render: (row) => row.name },
      { header: 'Faculty Guide', render: (row) => data.profiles.find((profile) => profile.id === row.faculty_guide_id)?.full_name ?? 'Unassigned' },
      { header: 'Status', render: (row) => <Badge tone={row.faculty_guide_id ? 'success' : 'muted'}>{row.faculty_guide_id ? 'Assigned' : 'Unassigned'}</Badge> },
    ]} /></div>
  </Card>
}

function Filter({ value, setValue, label, rows, allValue = 'all' }: { value: string; setValue: (value: string) => void; label: string; rows: Array<{ id: string; label: string }>; allValue?: string }) {
  return <Select value={value} onChange={(event) => setValue(event.target.value)}><option value={label.startsWith('All') || label.startsWith('Active') ? allValue : ''}>{label}</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</Select>
}

function Field({ label, children }: { label: string; children: import('react').ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<span className="mt-1 block">{children}</span></label>
}
