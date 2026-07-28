import { RefreshCw } from 'lucide-react'
import { useCallback } from 'react'

import { DataTable } from '@/components/common/DataTable'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { academicRepository } from '@/services/supabase/academicRepository'

export function FacultyWorkloadPage() {
  const resource = useAsyncResource(useCallback(() => academicRepository.loadAcademicData(), []))
  if (resource.isLoading) return <LoadingState label="Loading faculty workload…" />
  if (resource.error) return <ErrorState title="Unable to load faculty workload" description={resource.error} />
  const data = resource.data; if (!data) return null
  const rows = data.profiles.filter((profile) => profile.role === 'faculty').map((profile) => {
    const assignments = data.assignments.filter((assignment) => assignment.is_active && assignment.faculty_id === profile.id)
    const teaching = assignments.filter((assignment) => assignment.assignment_type === 'subject_faculty' || assignment.assignment_type === 'lab_faculty')
    const theoryHours = teaching.filter((assignment) => assignment.assignment_type === 'subject_faculty').reduce((sum, assignment) => sum + assignment.weekly_hours, 0)
    const practicalHours = teaching.filter((assignment) => assignment.assignment_type === 'lab_faculty').reduce((sum, assignment) => sum + assignment.weekly_hours, 0)
    const subjectNames = [...new Set(teaching.map((assignment) => data.subjects.find((subject) => subject.id === assignment.subject_id)?.code).filter(Boolean))].join(', ') || '—'
    const sections = [...new Set(assignments.map((assignment) => data.sections.find((section) => section.id === assignment.section_id)?.name).filter(Boolean))].join(', ') || '—'
    return { id: profile.id, profile, theoryHours, practicalHours, totalHours: theoryHours + practicalHours, subjectNames, sections, classTeacher: assignments.some((assignment) => assignment.assignment_type === 'class_teacher'), facultyGuide: assignments.some((assignment) => assignment.assignment_type === 'faculty_guide'), jury: assignments.some((assignment) => assignment.is_jury_eligible) }
  })
  const department = (id: string | null) => data.departments.find((item) => item.id === id)?.name ?? '—'
  return <div className="space-y-6"><PageHeader title="Faculty workload" description="Active academic allocations and responsibilities for the current department scope." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>} /><Card><DataTable rows={rows} empty={<EmptyState title="No Faculty profiles are available in this department" />} columns={[{ header: 'Faculty', render: (row) => <div><p className="font-semibold">{row.profile.full_name}</p><p className="text-xs text-muted">{row.profile.employee_or_register_number ?? '—'}</p></div> }, { header: 'Department', render: (row) => department(row.profile.department_id) }, { header: 'Subjects / sections', render: (row) => <div><p>{row.subjectNames}</p><p className="text-xs text-muted">{row.sections}</p></div> }, { header: 'Weekly hours', render: (row) => <div><p>Theory: {row.theoryHours} · Practical: {row.practicalHours}</p><p className="text-xs font-semibold text-muted">Total: {row.totalHours}</p></div> }, { header: 'Responsibilities', render: (row) => <div className="flex flex-wrap gap-1">{row.classTeacher && <Badge tone="primary">Class Teacher</Badge>}{row.facultyGuide && <Badge tone="primary">Faculty Guide</Badge>}{row.jury && <Badge tone="success">Jury</Badge>}{!row.classTeacher && !row.facultyGuide && !row.jury && '—'}</div> }]} /></Card></div>
}
