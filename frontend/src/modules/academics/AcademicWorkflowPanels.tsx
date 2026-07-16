import { Pencil, Plus, Power, Search } from 'lucide-react'
import { useCallback, useState } from 'react'

import { DataTable } from '@/components/common/DataTable'
import { Modal } from '@/components/common/Modal'
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
import { academicRepository, type AcademicData } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'

type MasterKind = 'department' | 'year' | 'semester' | 'section' | 'subject'
type MasterTarget = { kind: MasterKind; id: string }
type MasterForm = { code: string; name: string; departmentId: string; yearId: string; semesterId: string; starts: string; ends: string; number: string; capacity: string; credits: string; isLab: string }
type Enrollment = Database['public']['Tables']['enrollments']['Row']

const emptyMasterForm: MasterForm = { code: '', name: '', departmentId: '', yearId: '', semesterId: '', starts: '', ends: '', number: '1', capacity: '', credits: '0', isLab: 'false' }

export function AcademicWorkflowPanels() {
  const load = useCallback(() => academicRepository.loadAcademicData(), [])
  const resource = useAsyncResource(load)
  if (resource.isLoading) return <LoadingState label="Loading academic management workflows…" />
  if (resource.error) return <ErrorState title="Unable to load academic management workflows" description={resource.error} />
  if (!resource.data) return null
  return <div className="space-y-6"><AcademicMasterEditPanel data={resource.data} reload={resource.reload} /><EnrollmentManagementPanel data={resource.data} reload={resource.reload} /></div>
}

export function AcademicMasterEditPanel({ data, reload }: { data: AcademicData; reload: () => Promise<void> }) {
  const [target, setTarget] = useState<MasterTarget | null>(null)
  const [form, setForm] = useState<MasterForm>(emptyMasterForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [deactivateYear, setDeactivateYear] = useState<Database['public']['Tables']['academic_years']['Row'] | null>(null)

  const open = (next: MasterTarget) => {
    setMessage('')
    setTarget(next)
    if (next.kind === 'department') {
      const row = data.departments.find((item) => item.id === next.id)
      if (row) setForm({ ...emptyMasterForm, code: row.code, name: row.name })
    }
    if (next.kind === 'year') {
      const row = data.academicYears.find((item) => item.id === next.id)
      if (row) setForm({ ...emptyMasterForm, name: row.name, departmentId: row.department_id, starts: row.starts_on, ends: row.ends_on })
    }
    if (next.kind === 'semester') {
      const row = data.semesters.find((item) => item.id === next.id)
      if (row) setForm({ ...emptyMasterForm, name: row.name, yearId: row.academic_year_id, number: String(row.number), starts: row.starts_on ?? '', ends: row.ends_on ?? '' })
    }
    if (next.kind === 'section') {
      const row = data.sections.find((item) => item.id === next.id)
      if (row) setForm({ ...emptyMasterForm, name: row.name, departmentId: row.department_id, yearId: row.academic_year_id, semesterId: row.semester_id, number: String(row.year_number), capacity: row.capacity ? String(row.capacity) : '' })
    }
    if (next.kind === 'subject') {
      const row = data.subjects.find((item) => item.id === next.id)
      if (row) setForm({ ...emptyMasterForm, code: row.code, name: row.name, departmentId: row.department_id, semesterId: row.semester_id, credits: String(row.credits), isLab: String(row.is_lab) })
    }
  }

  const save = async () => {
    if (!target || !form.name.trim()) { setMessage('Name is required.'); return }
    setSaving(true); setMessage('')
    try {
      if (target.kind === 'department') {
        if (!form.code.trim()) throw new Error('Department code is required.')
        await academicRepository.updateDepartment(target.id, { code: form.code.trim().toUpperCase(), name: form.name.trim() })
      }
      if (target.kind === 'year') {
        if (!form.departmentId || !form.starts || !form.ends) throw new Error('Department, start date, and end date are required.')
        await academicRepository.updateAcademicYear(target.id, { department_id: form.departmentId, name: form.name.trim(), starts_on: form.starts, ends_on: form.ends })
      }
      if (target.kind === 'semester') {
        if (!form.yearId) throw new Error('Academic year is required.')
        await academicRepository.updateSemester(target.id, { academic_year_id: form.yearId, name: form.name.trim(), number: Number(form.number), starts_on: form.starts || null, ends_on: form.ends || null })
      }
      if (target.kind === 'section') {
        if (!form.departmentId || !form.yearId || !form.semesterId || Number(form.capacity) < 0) throw new Error('Enter a valid department, year, semester, and capacity.')
        await academicRepository.updateSection(target.id, { department_id: form.departmentId, academic_year_id: form.yearId, semester_id: form.semesterId, year_number: Number(form.number), name: form.name.trim(), capacity: form.capacity ? Number(form.capacity) : null })
      }
      if (target.kind === 'subject') {
        if (!form.departmentId || !form.semesterId || !form.code.trim() || Number(form.credits) < 0) throw new Error('Enter a valid department, semester, code, and credits.')
        await academicRepository.updateSubject(target.id, { department_id: form.departmentId, semester_id: form.semesterId, code: form.code.trim().toUpperCase(), name: form.name.trim(), credits: Number(form.credits), is_lab: form.isLab === 'true' })
      }
      await reload(); setTarget(null); setMessage('Academic record updated successfully.')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update the academic record.') } finally { setSaving(false) }
  }

  const setYearState = async (year: Database['public']['Tables']['academic_years']['Row'], active: boolean) => {
    setSaving(true); setMessage('')
    try {
      if (active) await academicRepository.setActiveAcademicYear(year.id, year.department_id)
      else await academicRepository.deactivateAcademicYear(year.id)
      await reload(); setDeactivateYear(null); setMessage(`Academic year ${active ? 'activated' : 'deactivated'}.`)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update the academic year.') } finally { setSaving(false) }
  }

  const action = (kind: MasterKind, id: string) => <Button aria-label={`Edit ${kind}`} className="min-h-8 px-2" variant="ghost" onClick={() => open({ kind, id })}><Pencil className="size-4" /></Button>
  return <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-text">Manage academic master data</h2><p className="mt-1 text-sm text-muted">Edit existing records. Only academic years have an active-state field in the current schema.</p></div>{message && <p className={message.includes('success') || message.includes('activated') ? 'text-sm text-success' : 'text-sm text-error'}>{message}</p>}</div><div className="mt-5 grid gap-5 xl:grid-cols-2"><MasterTable title="Departments" rows={data.departments} columns={[{ header: 'Code', render: (row) => row.code }, { header: 'Name', render: (row) => row.name }, { header: 'Edit', render: (row) => action('department', row.id) }]} /><MasterTable title="Academic years" rows={data.academicYears} columns={[{ header: 'Year', render: (row) => row.name }, { header: 'Status', render: (row) => <Badge tone={row.is_active ? 'success' : 'muted'}>{row.is_active ? 'Active' : 'Inactive'}</Badge> }, { header: 'Actions', render: (row) => <div className="flex gap-1">{action('year', row.id)}{row.is_active ? <Button aria-label="Deactivate academic year" className="min-h-8 px-2 text-error" variant="ghost" onClick={() => setDeactivateYear(row)}><Power className="size-4" /></Button> : <Button className="min-h-8 px-2" variant="secondary" disabled={saving} onClick={() => void setYearState(row, true)}>Activate</Button>}</div> }]} /><MasterTable title="Semesters" rows={data.semesters} columns={[{ header: 'Semester', render: (row) => `${row.number} · ${row.name}` }, { header: 'Academic year', render: (row) => data.academicYears.find((year) => year.id === row.academic_year_id)?.name ?? '—' }, { header: 'Edit', render: (row) => action('semester', row.id) }]} /><MasterTable title="Sections" rows={data.sections} columns={[{ header: 'Section', render: (row) => `Year ${row.year_number} · ${row.name}` }, { header: 'Capacity', render: (row) => row.capacity ?? '—' }, { header: 'Edit', render: (row) => action('section', row.id) }]} /><div className="xl:col-span-2"><MasterTable title="Subjects" rows={data.subjects} columns={[{ header: 'Code', render: (row) => row.code }, { header: 'Subject', render: (row) => row.name }, { header: 'Credits', render: (row) => row.credits }, { header: 'Type', render: (row) => row.is_lab ? 'Lab' : 'Theory' }, { header: 'Edit', render: (row) => action('subject', row.id) }]} /></div></div><MasterEditDialog target={target} form={form} setForm={setForm} data={data} message={message} saving={saving} onClose={() => setTarget(null)} onSave={save} /><ConfirmDialog isOpen={Boolean(deactivateYear)} title="Deactivate academic year?" description="The year remains stored and referenced records are preserved, but it will no longer be the active academic year." confirmLabel="Deactivate" onCancel={() => setDeactivateYear(null)} onConfirm={() => { if (deactivateYear) void setYearState(deactivateYear, false) }} /></Card>
}

function MasterTable<T extends { id: string }>({ title, rows, columns }: { title: string; rows: T[]; columns: Array<{ header: string; render: (row: T) => import('react').ReactNode }> }) {
  return <section><h3 className="mb-3 font-semibold text-text">{title}</h3><DataTable rows={rows} columns={columns} empty={<EmptyState title={`No ${title.toLowerCase()} configured`} />} /></section>
}

function MasterEditDialog({ target, form, setForm, data, message, saving, onClose, onSave }: { target: MasterTarget | null; form: MasterForm; setForm: (form: MasterForm) => void; data: AcademicData; message: string; saving: boolean; onClose: () => void; onSave: () => Promise<void> }) {
  const kind = target?.kind
  return <Modal isOpen={Boolean(target)} title={`Edit ${kind ?? 'academic record'}`} onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>{(kind === 'department' || kind === 'subject') && <Field label="Code"><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field>}{(kind === 'year' || kind === 'section' || kind === 'subject') && <Field label="Department"><Select value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>}{(kind === 'semester' || kind === 'section') && <Field label="Academic year"><Select value={form.yearId} onChange={(event) => setForm({ ...form, yearId: event.target.value })}>{data.academicYears.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>}{(kind === 'section' || kind === 'subject') && <Field label="Semester"><Select value={form.semesterId} onChange={(event) => setForm({ ...form, semesterId: event.target.value })}>{data.semesters.filter((row) => kind !== 'section' || row.academic_year_id === form.yearId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>}{(kind === 'semester' || kind === 'section') && <Field label={kind === 'section' ? 'Year number' : 'Semester number'}><Input min="1" type="number" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /></Field>}{(kind === 'year' || kind === 'semester') && <><Field label="Start date"><Input type="date" value={form.starts} onChange={(event) => setForm({ ...form, starts: event.target.value })} /></Field><Field label="End date"><Input type="date" value={form.ends} onChange={(event) => setForm({ ...form, ends: event.target.value })} /></Field></>}{kind === 'section' && <Field label="Capacity"><Input min="1" type="number" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></Field>}{kind === 'subject' && <><Field label="Credits"><Input min="0" step="0.5" type="number" value={form.credits} onChange={(event) => setForm({ ...form, credits: event.target.value })} /></Field><Field label="Type"><Select value={form.isLab} onChange={(event) => setForm({ ...form, isLab: event.target.value })}><option value="false">Theory</option><option value="true">Lab</option></Select></Field></>}</div>{message && <p className="mt-3 text-sm text-error">{message}</p>}<div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void onSave()}>{saving ? 'Saving…' : 'Save changes'}</Button></div></Modal>
}

export function EnrollmentManagementPanel({ data, reload }: { data: AcademicData; reload: () => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [semesterFilter, setSemesterFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [editing, setEditing] = useState<Enrollment | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [yearId, setYearId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [status, setStatus] = useState('active')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [deactivateTarget, setDeactivateTarget] = useState<Enrollment | null>(null)

  const profile = (id: string) => data.profiles.find((row) => row.id === id)
  const section = (id: string) => data.sections.find((row) => row.id === id)
  const activeStudents = data.profiles.filter((row) => row.role === 'student' && row.status === 'active')
  const visible = data.enrollments.filter((entry) => {
    const student = profile(entry.student_id)
    const selectedSection = section(entry.section_id)
    const text = `${student?.full_name ?? ''} ${student?.employee_or_register_number ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase()) &&
      (departmentFilter === 'all' || selectedSection?.department_id === departmentFilter) &&
      (yearFilter === 'all' || entry.academic_year_id === yearFilter) &&
      (semesterFilter === 'all' || selectedSection?.semester_id === semesterFilter) &&
      (sectionFilter === 'all' || selectedSection?.id === sectionFilter)
  })

  const open = (entry?: Enrollment) => {
    setEditing(entry ?? null); setFormOpen(true); setMessage('')
    setStudentId(entry?.student_id ?? ''); setYearId(entry?.academic_year_id ?? data.academicYears[0]?.id ?? ''); setSectionId(entry?.section_id ?? ''); setStatus(entry?.status ?? 'active')
  }
  const save = async () => {
    if (!studentId || !yearId || !sectionId) { setMessage('Student, academic year, and section are required.'); return }
    setSaving(true); setMessage('')
    try {
      if (editing) await academicRepository.updateEnrollment(editing.id, { student_id: studentId, academic_year_id: yearId, section_id: sectionId, status })
      else await academicRepository.createEnrollment({ student_id: studentId, academic_year_id: yearId, section_id: sectionId, status })
      await reload(); setFormOpen(false); setMessage('Enrollment saved successfully.')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to save enrollment.') } finally { setSaving(false) }
  }
  const deactivate = async () => {
    if (!deactivateTarget) return
    setSaving(true)
    try { await academicRepository.deactivateEnrollment(deactivateTarget.id); await reload(); setDeactivateTarget(null); setMessage('Enrollment deactivated.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to deactivate enrollment.') } finally { setSaving(false) }
  }

  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-text">Student enrollments</h2><p className="mt-1 text-sm text-muted">Manage existing active student profiles and their academic sections.</p></div><Button onClick={() => open()}><Plus className="size-4" /> Add enrollment</Button></div>{message && !formOpen && <p className={`mt-3 text-sm ${message.includes('success') || message.includes('deactivated') ? 'text-success' : 'text-error'}`}>{message}</p>}<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="relative"><span className="sr-only">Search students</span><Search className="absolute left-3 top-3 size-4 text-muted" /><Input className="pl-9" placeholder="Search student or register number" value={query} onChange={(event) => setQuery(event.target.value)} /></label><Select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">All departments</option>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option value="all">All academic years</option>{data.academicYears.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}><option value="all">All semesters</option>{data.semesters.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}><option value="all">All sections</option>{data.sections.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></div><div className="mt-4"><DataTable rows={visible} empty={<EmptyState title="No enrollments found" />} columns={[{ header: 'Student', render: (entry) => <div><p className="font-semibold">{profile(entry.student_id)?.full_name ?? 'Unknown student'}</p><p className="text-xs text-muted">{profile(entry.student_id)?.employee_or_register_number ?? '—'}</p></div> }, { header: 'Academic context', render: (entry) => { const selected = section(entry.section_id); return <div><p>{data.academicYears.find((row) => row.id === entry.academic_year_id)?.name ?? '—'} · {selected?.name ?? '—'}</p><p className="text-xs text-muted">{data.semesters.find((row) => row.id === selected?.semester_id)?.name ?? '—'} · {data.departments.find((row) => row.id === selected?.department_id)?.name ?? '—'}</p></div> } }, { header: 'Status', render: (entry) => <Badge tone={entry.status === 'active' ? 'success' : 'muted'}>{entry.status}</Badge> }, { header: 'Actions', render: (entry) => <div className="flex gap-1"><Button className="min-h-8 px-2" variant="ghost" onClick={() => open(entry)}><Pencil className="size-4" /></Button>{entry.status === 'active' && <Button className="min-h-8 px-2 text-error" variant="ghost" onClick={() => setDeactivateTarget(entry)}><Power className="size-4" /></Button>}</div> }]} /></div><Modal isOpen={formOpen} title={editing ? 'Edit enrollment' : 'Add enrollment'} onClose={() => setFormOpen(false)}><div className="space-y-3"><Field label="Student"><Select disabled={Boolean(editing)} value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Select active student</option>{activeStudents.map((row) => <option key={row.id} value={row.id}>{row.full_name} · {row.employee_or_register_number ?? 'No register number'}</option>)}</Select></Field><Field label="Academic year"><Select value={yearId} onChange={(event) => { setYearId(event.target.value); setSectionId('') }}><option value="">Select year</option>{data.academicYears.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field><Field label="Section"><Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">Select compatible section</option>{data.sections.filter((row) => row.academic_year_id === yearId).map((row) => <option key={row.id} value={row.id}>Year {row.year_number} · {row.name}</option>)}</Select></Field><Field label="Status"><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="completed">Completed</option></Select></Field></div>{message && <p className="mt-3 text-sm text-error">{message}</p>}<div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save enrollment'}</Button></div></Modal><ConfirmDialog isOpen={Boolean(deactivateTarget)} title="Deactivate enrollment?" description="The enrollment history will be preserved and its status changed to inactive." confirmLabel="Deactivate" onCancel={() => setDeactivateTarget(null)} onConfirm={() => void deactivate()} /></Card>
}

function Field({ label, children }: { label: string; children: import('react').ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<span className="mt-1 block">{children}</span></label>
}
