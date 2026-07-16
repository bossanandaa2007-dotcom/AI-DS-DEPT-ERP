import { Pencil, RefreshCw, Trash2, UserRoundCheck } from 'lucide-react'
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
import { Select } from '@/components/ui/Select'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { academicRepository, type AcademicData } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'

type Assignment = Database['public']['Tables']['faculty_assignments']['Row']
type AssignmentType = Database['public']['Enums']['assignment_type']

export function FacultyAssignmentPanels() {
  const load = useCallback(() => academicRepository.loadAcademicData(), [])
  const resource = useAsyncResource(load)
  const [facultyFilter, setFacultyFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [semesterFilter, setSemesterFilter] = useState('all')
  const [editing, setEditing] = useState<Assignment | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Assignment | null>(null)
  const [facultyId, setFacultyId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [type, setType] = useState<AssignmentType>('subject_faculty')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [classSectionId, setClassSectionId] = useState('')
  const [classFacultyId, setClassFacultyId] = useState('')

  if (resource.isLoading) return <LoadingState label="Loading assignment management…" />
  if (resource.error) return <ErrorState title="Unable to load assignment management" description={resource.error} />
  const data = resource.data
  if (!data) return null

  const activeFaculty = data.profiles.filter((profile) => profile.role === 'faculty' && profile.status === 'active')
  const activeAssignments = data.assignments.filter((assignment) => assignment.is_active)
  const visible = activeAssignments.filter((assignment) =>
    (facultyFilter === 'all' || assignment.faculty_id === facultyFilter) &&
    (subjectFilter === 'all' || assignment.subject_id === subjectFilter) &&
    (sectionFilter === 'all' || assignment.section_id === sectionFilter) &&
    (semesterFilter === 'all' || assignment.semester_id === semesterFilter)
  )

  const name = (id: string) => data.profiles.find((profile) => profile.id === id)?.full_name ?? 'Unknown Faculty'
  const section = (id: string) => data.sections.find((item) => item.id === id)
  const subject = (id: string | null) => data.subjects.find((item) => item.id === id)
  const openEdit = (assignment: Assignment) => {
    setEditing(assignment); setFacultyId(assignment.faculty_id); setSubjectId(assignment.subject_id ?? ''); setSectionId(assignment.section_id); setType(assignment.assignment_type); setMessage('')
  }
  const saveEdit = async () => {
    if (!editing || !facultyId || !sectionId) return
    const selectedSection = section(sectionId)
    if (!selectedSection) { setMessage('Select a valid section.'); return }
    const needsSubject = type === 'subject_faculty' || type === 'lab_faculty'
    if (needsSubject && !subjectId) { setMessage('Subject is required for this assignment type.'); return }
    const selectedSubject = needsSubject ? subject(subjectId) : null
    if (selectedSubject && (selectedSubject.semester_id !== selectedSection.semester_id || selectedSubject.department_id !== selectedSection.department_id)) { setMessage('Subject and section must share a semester and department.'); return }
    if (activeAssignments.some((item) => item.id !== editing.id && item.faculty_id === facultyId && item.section_id === sectionId && item.subject_id === (needsSubject ? subjectId : null) && item.assignment_type === type)) { setMessage('This active Faculty assignment already exists.'); return }
    setSaving(true); setMessage('')
    try {
      await academicRepository.updateFacultyAssignment(editing.id, { faculty_id: facultyId, section_id: sectionId, subject_id: needsSubject ? subjectId : null, academic_year_id: selectedSection.academic_year_id, semester_id: selectedSection.semester_id, assignment_type: type })
      await resource.reload(); setEditing(null); setMessage('Faculty assignment updated.')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update Faculty assignment.') } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!removeTarget) return
    setSaving(true)
    try { await academicRepository.deactivateFacultyAssignment(removeTarget.id); await resource.reload(); setRemoveTarget(null); setMessage('Faculty assignment deactivated.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to deactivate Faculty assignment.') } finally { setSaving(false) }
  }
  const assignClassTeacher = async () => {
    const selectedSection = section(classSectionId)
    if (!selectedSection || !classFacultyId) { setMessage('Select an active Faculty member and section.'); return }
    setSaving(true); setMessage('')
    try {
      await academicRepository.assignClassTeacher({ faculty_id: classFacultyId, section_id: selectedSection.id, academic_year_id: selectedSection.academic_year_id, semester_id: selectedSection.semester_id, is_active: true })
      await resource.reload(); setMessage('Class Teacher assigned.')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to assign Class Teacher.') } finally { setSaving(false) }
  }

  return <div className="space-y-6"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-text">Assignment management</h2><p className="mt-1 text-sm text-muted">Edit or safely deactivate active Faculty assignments.</p></div><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button></div>{message && <p className={`mt-3 text-sm ${message.includes('updated') || message.includes('assigned') || message.includes('deactivated') ? 'text-success' : 'text-error'}`}>{message}</p>}<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Filter value={facultyFilter} setValue={setFacultyFilter} label="All Faculty" rows={activeFaculty.map((row) => ({ id: row.id, label: row.full_name }))} /><Filter value={subjectFilter} setValue={setSubjectFilter} label="All subjects" rows={data.subjects.map((row) => ({ id: row.id, label: `${row.code} · ${row.name}` }))} /><Filter value={sectionFilter} setValue={setSectionFilter} label="All sections" rows={data.sections.map((row) => ({ id: row.id, label: row.name }))} /><Filter value={semesterFilter} setValue={setSemesterFilter} label="All semesters" rows={data.semesters.map((row) => ({ id: row.id, label: row.name }))} /></div><div className="mt-4"><DataTable rows={visible} empty={<EmptyState title="No active assignments match the filters" />} columns={[{ header: 'Faculty', render: (item) => name(item.faculty_id) }, { header: 'Academic context', render: (item) => <div><p>{section(item.section_id)?.name ?? '—'} · {data.semesters.find((row) => row.id === item.semester_id)?.name ?? '—'}</p><p className="text-xs text-muted">{subject(item.subject_id)?.name ?? 'No subject'}</p></div> }, { header: 'Role', render: (item) => <Badge tone="primary">{item.assignment_type.replaceAll('_', ' ')}</Badge> }, { header: 'Actions', render: (item) => <div className="flex gap-1"><Button className="min-h-8 px-2" variant="ghost" onClick={() => openEdit(item)}><Pencil className="size-4" /></Button><Button className="min-h-8 px-2 text-error" variant="ghost" onClick={() => setRemoveTarget(item)}><Trash2 className="size-4" /></Button></div> }]} /></div></Card><ClassTeacherPanel data={data} faculty={activeFaculty} sectionId={classSectionId} setSectionId={setClassSectionId} facultyId={classFacultyId} setFacultyId={setClassFacultyId} saving={saving} onAssign={assignClassTeacher} onRemove={setRemoveTarget} /><ProjectGuidePanel data={data} reload={resource.reload} /><Modal isOpen={Boolean(editing)} title="Edit Faculty assignment" onClose={() => setEditing(null)}>{editing && <div className="space-y-3"><Field label="Faculty"><Select value={facultyId} onChange={(event) => setFacultyId(event.target.value)}>{activeFaculty.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</Select></Field><Field label="Assignment type"><Select value={type} onChange={(event) => setType(event.target.value as AssignmentType)}><option value="subject_faculty">Subject Faculty</option><option value="lab_faculty">Lab Faculty</option><option value="class_teacher">Class Teacher</option></Select></Field><Field label="Section"><Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{data.sections.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>{(type === 'subject_faculty' || type === 'lab_faculty') && <Field label="Subject"><Select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{data.subjects.filter((row) => row.semester_id === section(sectionId)?.semester_id).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</Select></Field>}</div>}<div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={saving} onClick={() => void saveEdit()}>{saving ? 'Saving…' : 'Save assignment'}</Button></div></Modal><ConfirmDialog isOpen={Boolean(removeTarget)} title="Deactivate Faculty assignment?" description="The assignment history is preserved and the active flag is disabled." confirmLabel="Deactivate" onCancel={() => setRemoveTarget(null)} onConfirm={() => void remove()} /></div>
}

function ClassTeacherPanel({ data, faculty, sectionId, setSectionId, facultyId, setFacultyId, saving, onAssign, onRemove }: { data: AcademicData; faculty: Database['public']['Tables']['profiles']['Row'][]; sectionId: string; setSectionId: (value: string) => void; facultyId: string; setFacultyId: (value: string) => void; saving: boolean; onAssign: () => Promise<void>; onRemove: (assignment: Assignment) => void }) {
  const teachers = data.assignments.filter((item) => item.is_active && item.assignment_type === 'class_teacher')
  return <Card><h2 className="font-bold text-text">Class Teacher management</h2><p className="mt-1 text-sm text-muted">Assigning a new teacher safely replaces the current active teacher for that section.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Filter value={sectionId} setValue={setSectionId} label="Select section" rows={data.sections.map((row) => ({ id: row.id, label: `Year ${row.year_number} · ${row.name}` }))} /><Filter value={facultyId} setValue={setFacultyId} label="Select active Faculty" rows={faculty.map((row) => ({ id: row.id, label: row.full_name }))} /><Button disabled={saving} onClick={() => void onAssign()}><UserRoundCheck className="size-4" /> Assign / replace</Button></div><div className="mt-4"><DataTable rows={teachers} empty={<EmptyState title="No active Class Teachers" />} columns={[{ header: 'Section', render: (item) => data.sections.find((row) => row.id === item.section_id)?.name ?? '—' }, { header: 'Class Teacher', render: (item) => data.profiles.find((row) => row.id === item.faculty_id)?.full_name ?? '—' }, { header: 'Action', render: (item) => <Button className="min-h-8 px-2 text-error" variant="ghost" onClick={() => onRemove(item)}><Trash2 className="size-4" /> Remove</Button> }]} /></div></Card>
}

function ProjectGuidePanel({ data, reload }: { data: AcademicData; reload: () => Promise<void> }) {
  const [projectId, setProjectId] = useState('')
  const [facultyId, setFacultyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const activeFaculty = data.profiles.filter((row) => row.role === 'faculty' && row.status === 'active')
  const save = async () => {
    if (!projectId) { setMessage('Select a project.'); return }
    setSaving(true); setMessage('')
    try { await academicRepository.setProjectFacultyGuide(projectId, facultyId || null); await reload(); setMessage(facultyId ? 'Faculty Guide assigned.' : 'Faculty Guide removed.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update Faculty Guide.') } finally { setSaving(false) }
  }
  return <Card><h2 className="font-bold text-text">Project Faculty Guides</h2><p className="mt-1 text-sm text-muted">Uses the real `projects.faculty_guide_id` relationship.</p>{message && <p className={`mt-3 text-sm ${message.includes('assigned') || message.includes('removed') ? 'text-success' : 'text-error'}`}>{message}</p>}<div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Filter value={projectId} setValue={(value) => { setProjectId(value); setFacultyId(data.projects.find((row) => row.id === value)?.faculty_guide_id ?? '') }} label="Select project" rows={data.projects.map((row) => ({ id: row.id, label: row.name }))} /><Filter value={facultyId} setValue={setFacultyId} label="No guide / remove guide" rows={activeFaculty.map((row) => ({ id: row.id, label: row.full_name }))} /><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save guide'}</Button></div><div className="mt-4"><DataTable rows={data.projects} empty={<EmptyState title="No projects available for guide assignment" />} columns={[{ header: 'Project', render: (row) => row.name }, { header: 'Faculty Guide', render: (row) => data.profiles.find((profile) => profile.id === row.faculty_guide_id)?.full_name ?? 'Unassigned' }, { header: 'Status', render: (row) => <Badge tone={row.faculty_guide_id ? 'success' : 'muted'}>{row.faculty_guide_id ? 'Assigned' : 'Unassigned'}</Badge> }]} /></div></Card>
}

function Filter({ value, setValue, label, rows }: { value: string; setValue: (value: string) => void; label: string; rows: Array<{ id: string; label: string }> }) {
  return <Select value={value} onChange={(event) => setValue(event.target.value)}><option value={label.startsWith('All') ? 'all' : ''}>{label}</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</Select>
}

function Field({ label, children }: { label: string; children: import('react').ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<span className="mt-1 block">{children}</span></label>
}
