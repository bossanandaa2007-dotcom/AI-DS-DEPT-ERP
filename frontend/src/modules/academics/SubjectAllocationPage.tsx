import { RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'

import { DataTable } from '@/components/common/DataTable'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { FacultyAssignmentPanels } from '@/modules/academics/FacultyAssignmentPanels'
import { academicRepository } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'

type AssignmentType = Database['public']['Enums']['assignment_type']
const types: AssignmentType[] = ['subject_faculty', 'lab_faculty', 'class_teacher', 'faculty_guide']

function SubjectAllocationContent() {
  const load = useCallback(() => academicRepository.loadAcademicData(), []); const resource = useAsyncResource(load); const [facultyId, setFacultyId] = useState(''); const [subjectId, setSubjectId] = useState(''); const [sectionId, setSectionId] = useState(''); const [type, setType] = useState<AssignmentType>('subject_faculty'); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('')
  if (resource.isLoading) return <LoadingState label="Loading Faculty assignments…" />
  if (resource.error) return <ErrorState title="Unable to load Faculty assignments" description={resource.error} />
  const data = resource.data; if (!data) return null
  const activeFaculty = data.profiles.filter((profile) => profile.role === 'faculty' && profile.status === 'active'); const section = data.sections.find((item) => item.id === sectionId); const needsSubject = type === 'subject_faculty' || type === 'lab_faculty'
  const save = async () => { if (!facultyId || !sectionId || (needsSubject && !subjectId) || !section) { setMessage('Select valid active Faculty, section, and subject where required.'); return } setSaving(true); setMessage(''); try { await academicRepository.createFacultyAssignment({ faculty_id: facultyId, section_id: sectionId, subject_id: needsSubject ? subjectId : null, academic_year_id: section.academic_year_id, semester_id: section.semester_id, assignment_type: type, is_active: true }); setMessage('Assignment saved.'); setSubjectId(''); await resource.reload() } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to save assignment.') } finally { setSaving(false) } }
  const name = (id: string) => data.profiles.find((profile) => profile.id === id)?.full_name ?? 'Unknown'; const subject = (id: string | null) => data.subjects.find((item) => item.id === id)
  return <div className="space-y-6"><PageHeader title="Faculty subject allocation" description="Live assignments used by attendance, marks, class-teacher and guide workflows." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>} /><Card><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="text-sm font-semibold">Faculty<Select className="mt-1" value={facultyId} onChange={(event) => setFacultyId(event.target.value)}><option value="">Select active Faculty</option>{activeFaculty.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.full_name}</option>)}</Select></label><label className="text-sm font-semibold">Responsibility<Select className="mt-1" value={type} onChange={(event) => setType(event.target.value as AssignmentType)}>{types.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select></label><label className="text-sm font-semibold">Section<Select className="mt-1" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">Select section</option>{data.sections.map((item) => <option key={item.id} value={item.id}>Year {item.year_number} · {item.name}</option>)}</Select></label>{needsSubject && <label className="text-sm font-semibold">Subject<Select className="mt-1" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Select subject</option>{data.subjects.filter((item) => !section || item.semester_id === section.semester_id).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</Select></label>}<div className="flex items-end"><Button className="w-full" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Assign Faculty'}</Button></div></div>{message && <p className={`mt-4 text-sm ${message === 'Assignment saved.' ? 'text-success' : 'text-error'}`}>{message}</p>}</Card><Card><h2 className="font-bold text-text">Current allocations</h2><div className="mt-4"><DataTable rows={data.assignments} empty={<EmptyState title="No Faculty assignments" />} columns={[{ header: 'Faculty', render: (item) => name(item.faculty_id) }, { header: 'Subject', render: (item) => item.subject_id ? `${subject(item.subject_id)?.code ?? '—'} · ${subject(item.subject_id)?.name ?? 'Unknown'}` : 'Not applicable' }, { header: 'Section', render: (item) => data.sections.find((section) => section.id === item.section_id)?.name ?? '—' }, { header: 'Role', render: (item) => <Badge tone="primary">{item.assignment_type.replaceAll('_', ' ')}</Badge> }, { header: 'Jury', render: (item) => item.is_jury_eligible ? <Badge tone="success">Eligible</Badge> : '—' }]} /></div></Card></div>
}

export function SubjectAllocationPage() {
  return <div className="space-y-6"><SubjectAllocationContent /><FacultyAssignmentPanels /></div>
}
