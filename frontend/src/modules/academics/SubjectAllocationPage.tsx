import { RefreshCw, UserRoundCheck, X } from 'lucide-react'
import { useCallback, useState } from 'react'

import { DataTable } from '@/components/common/DataTable'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { USER_ROLES } from '@/constants/roles'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { AllocationDirectory, ProjectGuidePanel } from '@/modules/academics/FacultyAssignmentPanels'
import { academicRepository, type AcademicData } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'
import { isTeachingStaff } from '@/lib/auth'

type Assignment = Database['public']['Tables']['faculty_assignments']['Row']
type Subject = Database['public']['Tables']['subjects']['Row']
type AssignmentType = Database['public']['Enums']['assignment_type']

export function SubjectAllocationPage() {
  const { currentUser } = useAuth()
  const canManage = currentUser?.role === USER_ROLES.superAdmin
  // One load for the whole page: the board, the directory and the guide panel all read the same
  // snapshot, so a change in any of them is reflected everywhere without a second round trip.
  const load = useCallback(() => academicRepository.loadAcademicData(), [])
  const resource = useAsyncResource(load, 'academicData')
  if (resource.isLoading && !resource.data) return <LoadingState label="Loading Faculty allocations…" />
  if (resource.error) return <ErrorState title="Unable to load Faculty allocations" description={resource.error} />
  const data = resource.data
  if (!data) return null
  return <div className="space-y-6">
    <PageHeader title="Faculty subject allocation" description="Allocate every subject in a section, then review the full allocation history." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    <SectionAllocationBoard data={data} reload={resource.reload} canManage={canManage} />
    <AllocationDirectory data={data} reload={resource.reload} canManage={canManage} />
    <ProjectGuidePanel data={data} reload={resource.reload} canManage={canManage} />
  </div>
}

/**
 * Section-first view: every subject the section studies, and who teaches it. Unallocated subjects
 * are called out because an unallocated subject cannot be put on the timetable, cannot have
 * attendance opened, and cannot be given an assessment.
 */
function SectionAllocationBoard({ data, reload, canManage }: { data: AcademicData; reload: () => Promise<void>; canManage: boolean }) {
  const [sectionId, setSectionId] = useState(data.sections[0]?.id ?? '')
  const [target, setTarget] = useState<Subject | null>(null)
  const [facultyId, setFacultyId] = useState('')
  const [type, setType] = useState<AssignmentType>('subject_faculty')
  const [classFacultyId, setClassFacultyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [removing, setRemoving] = useState<Assignment | null>(null)

  const section = data.sections.find((row) => row.id === sectionId)
  const subjects = data.subjects.filter((row) => section && row.semester_id === section.semester_id)
  const activeFaculty = data.profiles.filter((row) => isTeachingStaff(row.role) && row.status === 'active')
  const facultyName = (id: string) => data.profiles.find((row) => row.id === id)?.full_name ?? 'Unknown Faculty'
  const allocationsFor = (subjectId: string) => data.assignments.filter((row) => row.is_active && row.section_id === sectionId && row.subject_id === subjectId)
  const classTeacher = data.assignments.find((row) => row.is_active && row.assignment_type === 'class_teacher' && row.section_id === sectionId)
  const studentCount = (id: string) => data.enrollments.filter((row) => row.section_id === id && row.status === 'active').length
  const allocated = subjects.filter((row) => allocationsFor(row.id).length > 0).length

  const openAllocate = (subject: Subject) => {
    if (!canManage) return
    setTarget(subject)
    setFacultyId('')
    setType(subject.is_lab ? 'lab_faculty' : 'subject_faculty')
    setMessage('')
  }
  const allocate = async () => {
    if (!canManage) return
    if (!target || !section) return
    if (!facultyId) { setMessage('Select an active Faculty member.'); return }
    setSaving(true); setMessage('')
    try {
      await academicRepository.createFacultyAssignment({ faculty_id: facultyId, section_id: section.id, subject_id: target.id, academic_year_id: section.academic_year_id, semester_id: section.semester_id, assignment_type: type, is_active: true })
      await reload(); setTarget(null); setNotice(`${facultyName(facultyId)} allocated to ${target.code}.`)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to allocate this subject.') } finally { setSaving(false) }
  }
  const removeAllocation = async () => {
    if (!canManage) return
    if (!removing) return
    setSaving(true)
    try { await academicRepository.deactivateFacultyAssignment(removing.id); await reload(); setNotice(`${facultyName(removing.faculty_id)} removed from this subject.`) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to remove this allocation.') } finally { setSaving(false); setRemoving(null) }
  }
  const saveClassTeacher = async () => {
    if (!canManage) return
    if (!section || !classFacultyId) { setNotice('Select an active Faculty member for the Class Teacher role.'); return }
    setSaving(true); setNotice('')
    try {
      await academicRepository.assignClassTeacher({ faculty_id: classFacultyId, section_id: section.id, academic_year_id: section.academic_year_id, semester_id: section.semester_id, is_active: true })
      await reload(); setClassFacultyId(''); setNotice('Class Teacher assigned.')
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to assign the Class Teacher.') } finally { setSaving(false) }
  }

  if (!data.sections.length) return <Card><EmptyState title="No sections yet" description="Create an academic year, semester and section in Academic Setup before allocating Faculty." /></Card>

  return <>
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="text-sm font-semibold text-text">Section
          <Select className="mt-1 min-w-72" value={sectionId} onChange={(event) => { setSectionId(event.target.value); setNotice(''); setClassFacultyId('') }}>{data.sections.map((row) => <option key={row.id} value={row.id}>Year {row.year_number} · {row.name} · {studentCount(row.id)} student{studentCount(row.id) === 1 ? '' : 's'}</option>)}</Select>
        </label>
        <p className="text-sm text-muted">{allocated} of {subjects.length} subject{subjects.length === 1 ? '' : 's'} allocated</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3">
        <div className="mr-auto">
          <p className="text-sm font-semibold text-text">Class Teacher</p>
          <p className="text-xs text-muted">{classTeacher ? facultyName(classTeacher.faculty_id) : 'Not assigned for this section'}</p>
        </div>
        {canManage && <Select className="max-w-xs" value={classFacultyId} onChange={(event) => setClassFacultyId(event.target.value)}><option value="">Select active Faculty</option>{activeFaculty.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</Select>}
        {canManage && <Button variant="secondary" disabled={saving || !classFacultyId} onClick={() => void saveClassTeacher()}><UserRoundCheck className="size-4" /> {classTeacher ? 'Replace' : 'Assign'}</Button>}
      </div>
      {notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}
    </Card>

    <Card>
      <h2 className="font-bold text-text">Subjects in this section</h2>
      <p className="mt-1 text-sm text-muted">An unallocated subject cannot be scheduled, cannot have attendance opened, and cannot be given an assessment.</p>
      <div className="mt-4"><DataTable rows={subjects} empty={<EmptyState title="No subjects in this semester" description="Add subjects for this semester in Academic Setup." />} columns={[
        { header: 'Subject', render: (subject) => <div><p className="font-semibold">{subject.name}</p><p className="text-xs text-muted">{subject.code}{subject.is_lab ? ' · lab' : ''} · {Number(subject.credits)} credits</p></div> },
        { header: 'Allocated Faculty', render: (subject) => {
          const rows = allocationsFor(subject.id)
          if (!rows.length) return <Badge tone="warning">Not allocated</Badge>
          return <div className="flex flex-wrap gap-2">{rows.map((row) => <span key={row.id} className="inline-flex items-center gap-1 rounded-full bg-background py-1 pl-3 pr-1 text-xs font-semibold text-text">
            {facultyName(row.faculty_id)}
            {canManage && <button type="button" aria-label={`Remove ${facultyName(row.faculty_id)}`} className="rounded-full p-1 text-muted hover:bg-error/10 hover:text-error" onClick={() => setRemoving(row)}><X className="size-3" /></button>}
          </span>)}</div>
        } },
        { header: 'Responsibility', render: (subject) => { const rows = allocationsFor(subject.id); return rows.length ? <div className="flex flex-wrap gap-1">{rows.map((row) => <Badge key={row.id} tone="primary">{row.assignment_type.replaceAll('_', ' ')}</Badge>)}</div> : <span className="text-muted">—</span> } },
        ...(canManage ? [{ header: 'Action', render: (subject: Subject) => <Button className="min-h-8" variant="secondary" onClick={() => openAllocate(subject)}>{allocationsFor(subject.id).length ? 'Add another' : 'Allocate'}</Button> }] : []),
      ]} /></div>
    </Card>

    <Modal isOpen={Boolean(target)} title={target ? `Allocate ${target.code} · ${target.name}` : ''} onClose={() => setTarget(null)}>
      {target && <div className="space-y-3">
        <p className="text-sm text-muted">{section ? `Year ${section.year_number} · ${section.name}` : ''}</p>
        <label className="block text-sm font-semibold">Faculty<Select className="mt-1" value={facultyId} onChange={(event) => setFacultyId(event.target.value)}><option value="">Select active Faculty</option>{activeFaculty.filter((row) => !allocationsFor(target.id).some((item) => item.faculty_id === row.id)).map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</Select></label>
        <label className="block text-sm font-semibold">Responsibility<Select className="mt-1" value={type} onChange={(event) => setType(event.target.value as AssignmentType)}><option value="subject_faculty">subject faculty</option><option value="lab_faculty">lab faculty</option></Select><span className="mt-1 block text-xs font-normal text-muted">{target.is_lab ? 'This subject is a lab, so lab faculty is preselected.' : 'Theory subjects normally use subject faculty.'}</span></label>
        {message && <p role="alert" className="text-sm text-error">{message}</p>}
        <div className="flex justify-end gap-3 pt-2"><Button variant="secondary" disabled={saving} onClick={() => setTarget(null)}>Cancel</Button><Button disabled={saving} onClick={() => void allocate()}>{saving ? 'Allocating…' : 'Allocate Faculty'}</Button></div>
      </div>}
    </Modal>

    <Modal isOpen={Boolean(removing)} title="Remove this allocation?" onClose={() => setRemoving(null)}>
      <p className="text-sm text-muted">{removing ? `${facultyName(removing.faculty_id)} will no longer be allocated to this subject. History is preserved and the allocation can be reactivated from All allocations.` : ''}</p>
      <p className="mt-3 text-sm text-warning">Timetable periods and assessments already pointing at this Faculty member will stop accepting attendance and marks until reallocated.</p>
      <div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" disabled={saving} onClick={() => void removeAllocation()}>{saving ? 'Removing…' : 'Remove allocation'}</Button></div>
    </Modal>
  </>
}
