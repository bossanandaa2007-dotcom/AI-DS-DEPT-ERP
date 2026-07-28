import { RefreshCw, Search } from 'lucide-react'
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
import { findAiDsDepartment } from '@/lib/departments'
import { useAuth } from '@/modules/auth/useAuth'
import { marksRepository, type AssessmentRow, type MarkCorrectionRow, type MarksData } from '@/services/supabase/marksRepository'

type StudentMarkRow = {
  id: string
  registerNumber: string
  name: string
  marks: string
  percentage: number | null
  result: 'Pass' | 'Fail' | 'Absent' | 'Not entered'
}

const studyYears = [1, 2, 3, 4]
const readable = (value: string) => value.replaceAll('_', ' ')
const tone = (status: string): 'success' | 'warning' | 'primary' | 'muted' => status === 'finalized' || status === 'approved' || status === 'Pass' ? 'success' : status === 'draft' || status === 'completed' || status === 'pending' ? 'warning' : status === 'rejected' || status === 'Fail' || status === 'Absent' ? 'muted' : 'primary'
const displayPercent = (value: number | null) => value === null ? '—' : value === 0 ? '0%' : `${Number.isInteger(value) ? value : value.toFixed(1)}%`

export function AdminMarksPage() {
  const { currentUser } = useAuth()
  const resource = useAsyncResource(useCallback(() => marksRepository.loadMarksData(), []))
  const [academicYearId, setAcademicYearId] = useState('')
  const [semesterId, setSemesterId] = useState('')
  const [studyYear, setStudyYear] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('')

  if (!currentUser || currentUser.role !== USER_ROLES.superAdmin) return <ErrorState title="Super Admin access required" description="Admin Marks is available only to the Super Admin." />
  if (resource.isLoading) return <LoadingState label="Loading Admin Marks..." />
  if (resource.error) return <div className="space-y-4"><ErrorState title="Unable to load Admin Marks" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  const data = resource.data
  if (!data) return null

  const aiDepartment = findAiDsDepartment(data.departments)
  if (!aiDepartment) return <ErrorState title="Department unavailable" description="Create a department before viewing Admin Marks." />
  const studyYearNumber = Number(studyYear)
  const academicYears = data.academicYears.filter((item) => item.department_id === aiDepartment.id && item.is_active)
  const semesters = data.semesters.filter((item) => item.academic_year_id === academicYearId && item.is_active)
  const sections = data.sections.filter((item) => item.department_id === aiDepartment.id && item.academic_year_id === academicYearId && item.semester_id === semesterId && item.year_number === studyYearNumber && item.is_active)
  const subjects = data.subjects.filter((item) => item.department_id === aiDepartment.id && item.semester_id === semesterId && item.study_year === studyYearNumber)
  const contextReady = Boolean(academicYearId && semesterId && studyYear && sectionId)
  const assessments = contextReady ? data.assessments.filter((assessment) => assessment.section_id === sectionId && subjects.some((subject) => subject.id === assessment.subject_id) && (subjectFilter === 'all' || assessment.subject_id === subjectFilter) && (statusFilter === 'all' || assessment.status === statusFilter)) : []
  const selectedAssessment = data.assessments.find((assessment) => assessment.id === selectedAssessmentId) ?? assessments[0]
  const studentRows = selectedAssessment ? buildStudentRows(data, selectedAssessment).filter((row) => `${row.registerNumber} ${row.name}`.toLowerCase().includes(search.toLowerCase())) : []
  const visibleCorrections = data.corrections.filter((correction) => {
    const mark = data.marks.find((item) => item.id === correction.mark_id)
    const assessment = data.assessments.find((item) => item.id === mark?.assessment_id)
    return Boolean(assessment && (!contextReady || assessments.some((item) => item.id === assessment.id)))
  })

  const resetAfterYear = (value: string) => { setAcademicYearId(value); setSemesterId(''); setStudyYear(''); setSectionId(''); setSelectedAssessmentId('') }
  const resetAfterSemester = (value: string) => { setSemesterId(value); setStudyYear(''); setSectionId(''); setSelectedAssessmentId('') }
  const resetAfterStudyYear = (value: string) => { setStudyYear(value); setSectionId(''); setSelectedAssessmentId('') }

  return <div className="space-y-6">
    <PageHeader title="Admin Marks" description="Read-only Super Admin monitoring for live assessments, finalized marks, and correction requests." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    <Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Select value={academicYearId} onChange={(event) => resetAfterYear(event.target.value)}><option value="">Academic Year</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select>
        <Select value={semesterId} onChange={(event) => resetAfterSemester(event.target.value)}><option value="">Semester</option>{semesters.map((semester) => <option key={semester.id} value={semester.id}>Semester {semester.number}</option>)}</Select>
        <Select value={studyYear} onChange={(event) => resetAfterStudyYear(event.target.value)}><option value="">Study Year</option>{studyYears.map((year) => <option key={year} value={year}>Year {year}</option>)}</Select>
        <Select value={sectionId} onChange={(event) => { setSectionId(event.target.value); setSelectedAssessmentId('') }}><option value="">Section</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}{section.batch ? ` - ${section.batch}` : ''}</option>)}</Select>
      </div>
    </Card>

    {!contextReady ? <EmptyState title="Select academic context" description="Choose Academic Year, Semester, Study Year, and Section to view marks." /> : <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Assessments" value={assessments.length.toString()} />
        <Metric label="Finalized" value={assessments.filter((row) => row.status === 'finalized').length.toString()} />
        <Metric label="Pending Corrections" value={visibleCorrections.filter((row) => row.status === 'pending').length.toString()} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold text-text">Assessments</h2><p className="text-sm text-muted">Subject, Faculty, maximum marks, and finalized status from Supabase.</p></div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <Select value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); setSelectedAssessmentId('') }}><option value="all">All Subjects</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}</Select>
            <Select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setSelectedAssessmentId('') }}><option value="all">All Statuses</option><option value="draft">Draft</option><option value="completed">Completed</option><option value="finalized">Finalized</option></Select>
          </div>
        </div>
        <div className="mt-4"><DataTable rows={assessments} empty={<EmptyState title="No assessments match this context" />} columns={[
          { header: 'Assessment', render: (row) => <button className="text-left font-semibold text-secondary" onClick={() => setSelectedAssessmentId(row.id)}>{row.title}</button> },
          { header: 'Subject', render: (row) => subjectName(data, row.subject_id) },
          { header: 'Faculty', render: (row) => profileLabel(data, row.faculty_id) },
          { header: 'Maximum Marks', render: (row) => row.maximum_marks },
          { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{readable(row.status)}</Badge> },
        ]} /></div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold text-text">Student Marks</h2><p className="text-sm text-muted">{selectedAssessment ? `${selectedAssessment.title} - ${subjectName(data, selectedAssessment.subject_id)}` : 'Select an assessment.'}</p></div>
          <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input className="pl-9" placeholder="Search register number or name" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        </div>
        <div className="mt-4"><DataTable rows={studentRows} empty={<EmptyState title="No student marks to display" />} columns={[
          { header: 'Register Number', render: (row) => row.registerNumber || '—' },
          { header: 'Name', render: (row) => row.name },
          { header: 'Marks', render: (row) => row.marks },
          { header: 'Percentage', render: (row) => displayPercent(row.percentage) },
          { header: 'Result', render: (row) => <Badge tone={tone(row.result)}>{row.result}</Badge> },
        ]} /></div>
      </Card>

      <CorrectionMonitor data={data} corrections={visibleCorrections.filter((row) => row.status === 'pending')} title="Pending correction requests" />
      <CorrectionMonitor data={data} corrections={visibleCorrections.filter((row) => row.status !== 'pending')} title="Correction history" />
    </>}
  </div>
}

function buildStudentRows(data: MarksData, assessment: AssessmentRow): StudentMarkRow[] {
  const studentIds = new Set(data.enrollments.filter((row) => row.section_id === assessment.section_id && row.status === 'active').map((row) => row.student_id))
  return data.profiles.filter((profile) => profile.role === 'student' && profile.status === 'active' && studentIds.has(profile.id)).map((student) => {
    const mark = data.marks.find((row) => row.assessment_id === assessment.id && row.student_id === student.id)
    const percentage = mark && !mark.absent && mark.obtained_marks !== null ? (Number(mark.obtained_marks) / assessment.maximum_marks) * 100 : null
    const result: StudentMarkRow['result'] = !mark ? 'Not entered' : mark.absent ? 'Absent' : percentage !== null && percentage >= 50 ? 'Pass' : 'Fail'
    return { id: student.id, registerNumber: student.employee_or_register_number ?? '', name: student.full_name, marks: !mark ? '—' : mark.absent ? 'Absent' : `${mark.obtained_marks} / ${assessment.maximum_marks}`, percentage, result }
  })
}

function CorrectionMonitor({ data, corrections, title }: { data: MarksData; corrections: MarkCorrectionRow[]; title: string }) {
  return <Card><h2 className="font-bold text-text">{title}</h2><div className="mt-4"><DataTable rows={corrections.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))} empty={<EmptyState title={`No ${title.toLowerCase()}`} />} columns={[
    { header: 'Student', render: (row) => profileLabel(data, row.student_id) },
    { header: 'Assessment', render: (row) => {
      const mark = data.marks.find((item) => item.id === row.mark_id)
      return data.assessments.find((item) => item.id === mark?.assessment_id)?.title ?? 'Assessment unavailable'
    } },
    { header: 'Change', render: (row) => `${row.original_marks ?? 'Absent'} to ${row.requested_marks ?? 'Absent'}` },
    { header: 'Reason', render: (row) => <span className="block max-w-xs whitespace-normal">{row.reason}</span> },
    { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{readable(row.status)}</Badge> },
    { header: 'Reviewer', render: (row) => row.reviewer_id ? profileLabel(data, row.reviewer_id) : '—' },
  ]} /></div></Card>
}

function subjectName(data: MarksData, id: string) {
  const subject = data.subjects.find((row) => row.id === id)
  return subject ? `${subject.code} - ${subject.name}` : 'Subject unavailable'
}

function profileLabel(data: MarksData, id: string) {
  const profile = data.profiles.find((row) => row.id === id)
  if (!profile) return 'Profile unavailable'
  return `${profile.full_name}${profile.employee_or_register_number ? ` - ${profile.employee_or_register_number}` : ''}`
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-text">{value}</p></Card>
}
