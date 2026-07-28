import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Pencil, Power, RefreshCw, Save, Search } from 'lucide-react'
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
import { academicRepository } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'

type Assignment = Database['public']['Tables']['faculty_assignments']['Row']
type AssignmentType = Database['public']['Enums']['assignment_type']
type SubjectAssignmentType = Extract<AssignmentType, 'subject_faculty' | 'lab_faculty'>
type Subject = Database['public']['Tables']['subjects']['Row']

type Draft = {
  academicYearId: string
  semesterId: string
  studyYear: string
  sectionId: string
  subjectId: string
  facultyId: string
  allocationType: SubjectAssignmentType
  weeklyHours: string
  effectiveFrom: string
  effectiveTo: string
  isActive: boolean
}

const blankDraft: Draft = { academicYearId: '', semesterId: '', studyYear: '', sectionId: '', subjectId: '', facultyId: '', allocationType: 'subject_faculty', weeklyHours: '', effectiveFrom: '', effectiveTo: '', isActive: true }
const studyYears = [1, 2, 3, 4]
const workflowSteps = ['Academic Context', 'Subject', 'Faculty', 'Details', 'Review']
const workloadWarningHours = 18
const allocationTypes: Array<{ value: SubjectAssignmentType; label: string }> = [{ value: 'subject_faculty', label: 'Subject Faculty' }, { value: 'lab_faculty', label: 'Lab Faculty' }]
const allocationLabel = (value: AssignmentType) => allocationTypes.find((item) => item.value === value)?.label ?? value.replaceAll('_', ' ')
const isSubjectAllocation = (value: AssignmentType): value is SubjectAssignmentType => value === 'subject_faculty' || value === 'lab_faculty'
const isLaboratorySubject = (subject?: Subject) => subject?.subject_type === 'laboratory'
const norm = (value: string | null | undefined) => (value ?? '').toLowerCase()
const dateRange = (from: string, to?: string | null) => `${from} to ${to || 'open ended'}`

export function SubjectAllocationPage() {
  const { currentUser } = useAuth()
  const resource = useAsyncResource(useCallback(() => academicRepository.loadSubjectAllocationData(), []))
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [step, setStep] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [semesterFilter, setSemesterFilter] = useState('all')
  const [studyYearFilter, setStudyYearFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [facultyFilter, setFacultyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')

  if (!currentUser || currentUser.role !== USER_ROLES.superAdmin) return <ErrorState title="Super Admin access required" description="Subject Allocation is available only to the Super Admin." />
  if (resource.isLoading) return <LoadingState label="Loading Subject Allocation..." />
  if (resource.error) return <div className="space-y-4"><ErrorState title="Unable to load Subject Allocation" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  const data = resource.data
  if (!data) return null

  const aiDepartment = findAiDsDepartment(data.departments)
  if (!aiDepartment) return <ErrorState title="Department unavailable" description="Create a department before assigning subjects." />

  const updateDraft = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }))
  const selectedYear = data.academicYears.find((item) => item.id === draft.academicYearId)
  const selectedSemester = data.semesters.find((item) => item.id === draft.semesterId)
  const selectedSection = data.sections.find((item) => item.id === draft.sectionId)
  const selectedSubject = data.subjects.find((item) => item.id === draft.subjectId)
  const selectedFaculty = data.profiles.find((item) => item.id === draft.facultyId)
  const studyYearNumber = Number(draft.studyYear)
  const activeYears = data.academicYears.filter((item) => item.department_id === aiDepartment.id && item.is_active)
  const activeSemesters = data.semesters.filter((item) => item.academic_year_id === draft.academicYearId && item.is_active)
  const activeSections = data.sections.filter((item) => item.department_id === aiDepartment.id && item.academic_year_id === draft.academicYearId && item.semester_id === draft.semesterId && item.year_number === studyYearNumber && item.is_active)
  const activeSubjects = data.subjects.filter((item) => item.department_id === aiDepartment.id && item.semester_id === draft.semesterId && item.study_year === studyYearNumber && item.is_active)
  const eligibleFaculty = data.profiles.filter((item) => item.role === 'faculty' && item.status === 'active' && item.department_id === aiDepartment.id)
  const facultyWorkload = (facultyId: string) => data.assignments.filter((item) => item.id !== editingId && item.is_active && item.faculty_id === facultyId && item.academic_year_id === draft.academicYearId && isSubjectAllocation(item.assignment_type)).reduce((total, item) => total + item.weekly_hours, 0)
  const selectedFacultyWorkload = draft.facultyId ? facultyWorkload(draft.facultyId) : 0
  const projectedWorkload = selectedFacultyWorkload + Number(draft.weeklyHours || 0)
  const workloadWarning = draft.facultyId && projectedWorkload > workloadWarningHours ? `Warning: projected Faculty workload is ${projectedWorkload} hrs/week, above the recommended ${workloadWarningHours} hrs/week.` : ''

  const allocations = data.assignments.filter((item) => isSubjectAllocation(item.assignment_type) && data.sections.find((section) => section.id === item.section_id)?.department_id === aiDepartment.id)
  const profile = (id: string) => data.profiles.find((item) => item.id === id)
  const subject = (id: string | null) => data.subjects.find((item) => item.id === id)
  const section = (id: string) => data.sections.find((item) => item.id === id)
  const semester = (id: string) => data.semesters.find((item) => item.id === id)
  const year = (id: string) => data.academicYears.find((item) => item.id === id)

  const filteredAllocations = allocations.filter((item) => {
    const rowSection = section(item.section_id)
    const rowSubject = subject(item.subject_id)
    const rowFaculty = profile(item.faculty_id)
    const haystack = [year(item.academic_year_id)?.name, `semester ${semester(item.semester_id)?.number ?? ''}`, rowSection?.name, rowSection?.batch, rowSubject?.code, rowSubject?.name, rowFaculty?.full_name, rowFaculty?.employee_or_register_number, allocationLabel(item.assignment_type)].map(norm).join(' ')
    return (!search || haystack.includes(norm(search)))
      && (yearFilter === 'all' || item.academic_year_id === yearFilter)
      && (semesterFilter === 'all' || item.semester_id === semesterFilter)
      && (studyYearFilter === 'all' || rowSection?.year_number === Number(studyYearFilter))
      && (sectionFilter === 'all' || item.section_id === sectionFilter)
      && (facultyFilter === 'all' || item.faculty_id === facultyFilter)
      && (statusFilter === 'all' || (statusFilter === 'active' ? item.is_active : !item.is_active))
  })

  const validationMessage = () => {
    if (!selectedYear || !selectedYear.is_active || selectedYear.department_id !== aiDepartment.id) return 'Select an active AI-DS Academic Year.'
    if (!selectedSemester || !selectedSemester.is_active || selectedSemester.academic_year_id !== selectedYear.id) return 'Select an active Semester that belongs to the Academic Year.'
    if (!studyYears.includes(studyYearNumber)) return 'Select Study Year 1, 2, 3, or 4.'
    if (!selectedSection || !selectedSection.is_active || selectedSection.department_id !== aiDepartment.id || selectedSection.academic_year_id !== selectedYear.id || selectedSection.semester_id !== selectedSemester.id || selectedSection.year_number !== studyYearNumber) return 'Select an active Section that matches the Academic Year, Semester, and Study Year.'
    if (!selectedSubject || !selectedSubject.is_active || selectedSubject.department_id !== aiDepartment.id || selectedSubject.semester_id !== selectedSemester.id || selectedSubject.study_year !== studyYearNumber) return 'Select an active Subject that matches the selected Semester and Study Year.'
    if (draft.allocationType === 'lab_faculty' && !isLaboratorySubject(selectedSubject)) return 'Lab Faculty can be selected only for laboratory Subjects.'
    if (!selectedFaculty || selectedFaculty.role !== 'faculty' || selectedFaculty.status !== 'active' || selectedFaculty.department_id !== aiDepartment.id) return 'Select an active AI-DS Faculty member.'
    if (!draft.effectiveFrom) return 'Select an effective-from date.'
    if (draft.effectiveTo && draft.effectiveTo < draft.effectiveFrom) return 'Effective-to date cannot be before effective-from date.'
    const hours = Number(draft.weeklyHours)
    if (!Number.isFinite(hours) || hours <= 0) return 'Assigned weekly hours must be greater than zero.'
    if (selectedSubject && hours > selectedSubject.weekly_hours) return 'Assigned weekly hours cannot exceed the Subject weekly hours.'
    if (!editingId && allocations.some((item) => item.is_active && item.assignment_type === draft.allocationType && item.section_id === draft.sectionId && item.subject_id === draft.subjectId)) return 'An active allocation already exists for this Subject and Section.'
    if (editingId && allocations.some((item) => item.id !== editingId && item.is_active && item.assignment_type === draft.allocationType && item.section_id === draft.sectionId && item.subject_id === draft.subjectId)) return 'An active allocation already exists for this Subject and Section.'
    return ''
  }

  const next = () => {
    const error = step === 1 ? validationMessageForStep(1) : step === 2 ? validationMessageForStep(2) : step === 3 ? validationMessageForStep(3) : step === 4 ? validationMessageForStep(4) : ''
    if (error) { setMessage({ tone: 'error', text: error }); return }
    setMessage(null); setStep((current) => Math.min(current + 1, workflowSteps.length))
  }

  const save = async () => {
    if (saving) return
    const error = validationMessage()
    if (error) { setMessage({ tone: 'error', text: error }); return }
    setSaving(true); setMessage(null)
    const value = { faculty_id: draft.facultyId, section_id: draft.sectionId, subject_id: draft.subjectId, academic_year_id: draft.academicYearId, semester_id: draft.semesterId, assignment_type: draft.allocationType, weekly_hours: Number(draft.weeklyHours), effective_from: draft.effectiveFrom, effective_to: draft.effectiveTo || null, is_active: draft.isActive }
    try {
      if (editingId) await academicRepository.updateFacultyAssignment(editingId, value)
      else await academicRepository.createFacultyAssignment(value)
      await resource.reload()
      setDraft(blankDraft); setEditingId(null); setStep(1); setMessage({ tone: 'success', text: editingId ? 'Allocation updated.' : 'Allocation saved.' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to save allocation.' })
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (id: string) => {
    if (saving) return
    setSaving(true); setMessage(null)
    try {
      await academicRepository.deactivateFacultyAssignment(id)
      await resource.reload()
      setMessage({ tone: 'success', text: 'Allocation deactivated. Historical record preserved.' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to deactivate allocation.' })
    } finally {
      setSaving(false)
    }
  }

  const edit = (item: Assignment) => {
    const rowSection = section(item.section_id)
    setDraft({ academicYearId: item.academic_year_id, semesterId: item.semester_id, studyYear: rowSection ? String(rowSection.year_number) : '', sectionId: item.section_id, subjectId: item.subject_id ?? '', facultyId: item.faculty_id, allocationType: isSubjectAllocation(item.assignment_type) ? item.assignment_type : 'subject_faculty', weeklyHours: String(item.weekly_hours), effectiveFrom: item.effective_from, effectiveTo: item.effective_to ?? year(item.academic_year_id)?.ends_on ?? '', isActive: item.is_active })
    setEditingId(item.id); setStep(1); setMessage({ tone: 'warning', text: 'Editing allocation. Review each step before saving.' })
  }

  function validationMessageForStep(targetStep: number) {
    if (targetStep >= 1) {
      if (!selectedYear || !selectedSemester || !studyYears.includes(studyYearNumber) || !selectedSection) return 'Complete Academic Year, Semester, Study Year, and Section.'
    }
    if (targetStep >= 2 && !selectedSubject) return 'Select an active Subject for the selected Semester and Study Year.'
    if (targetStep >= 3 && (!selectedFaculty || selectedFaculty.role !== 'faculty' || selectedFaculty.status !== 'active' || selectedFaculty.department_id !== aiDepartment.id)) return 'Select an active Faculty member.'
    if (targetStep >= 4) {
      if (!draft.effectiveFrom || (draft.effectiveTo && draft.effectiveTo < draft.effectiveFrom)) return 'Enter valid effective dates.'
      const hours = Number(draft.weeklyHours)
      if (!Number.isFinite(hours) || hours <= 0 || (selectedSubject && hours > selectedSubject.weekly_hours)) return 'Enter valid weekly hours within the Subject weekly hours.'
      if (draft.allocationType === 'lab_faculty' && !isLaboratorySubject(selectedSubject)) return 'Lab Faculty can be selected only for laboratory Subjects.'
    }
    return ''
  }

  return <div className="space-y-6">
    <PageHeader title="Subject Allocation" description="Super Admin allocation workflow for AI-DS subject and lab Faculty." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>} />

    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-text">{editingId ? 'Edit allocation' : 'New allocation'}</h2>
          <p className="text-sm text-muted">Department resolved by code: {aiDepartment.name} ({aiDepartment.code})</p>
        </div>
        {editingId && <Button variant="secondary" onClick={() => { setDraft(blankDraft); setEditingId(null); setStep(1); setMessage(null) }}>Cancel edit</Button>}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-5">
        {workflowSteps.map((label, index) => <div key={label} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${step === index + 1 ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted'}`}><span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-surface text-xs">{index + 1}</span>{label}</div>)}
      </div>

      <div className="mt-6">{step === 1 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Academic Year"><Select value={draft.academicYearId} onChange={(event) => { const nextYear = data.academicYears.find((item) => item.id === event.target.value); setDraft({ ...blankDraft, academicYearId: event.target.value, effectiveFrom: nextYear?.starts_on ?? '', effectiveTo: nextYear?.ends_on ?? '' }); setMessage(null) }}><option value="">Select Academic Year</option>{activeYears.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label="Semester"><Select value={draft.semesterId} onChange={(event) => updateDraft({ semesterId: event.target.value, studyYear: '', sectionId: '', subjectId: '', facultyId: '' })}><option value="">Select Semester</option>{activeSemesters.map((item) => <option key={item.id} value={item.id}>Semester {item.number}</option>)}</Select></Field>
        <Field label="Study Year"><Select value={draft.studyYear} onChange={(event) => updateDraft({ studyYear: event.target.value, sectionId: '', subjectId: '', facultyId: '' })}><option value="">Select Study Year</option>{studyYears.map((item) => <option key={item} value={item}>Year {item}</option>)}</Select></Field>
        <Field label="Section"><Select value={draft.sectionId} onChange={(event) => updateDraft({ sectionId: event.target.value, subjectId: '', facultyId: '' })}><option value="">Select Section</option>{activeSections.map((item) => <option key={item.id} value={item.id}>{item.name}{item.batch ? ` - Batch ${item.batch}` : ''}</option>)}</Select></Field>
      </div>}

      {step === 2 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {activeSubjects.map((item) => <button key={item.id} type="button" onClick={() => updateDraft({ subjectId: item.id, allocationType: 'subject_faculty', weeklyHours: String(item.weekly_hours), facultyId: '' })} className={`rounded-lg border p-4 text-left transition ${draft.subjectId === item.id ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-secondary'}`}><p className="font-bold text-text">{item.code}</p><p className="mt-1 text-sm text-muted">{item.name}</p><div className="mt-3 flex flex-wrap gap-2"><Badge tone={isLaboratorySubject(item) ? 'warning' : 'primary'}>{item.subject_type.replaceAll('_', ' ')}</Badge><Badge>{item.weekly_hours} hrs/week</Badge></div></button>)}
        {!activeSubjects.length && <div className="md:col-span-2 xl:col-span-3"><EmptyState title="No active Subjects match this context" description="Subjects must be active and linked to the selected Semester and Study Year." /></div>}
      </div>}

      {step === 3 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {eligibleFaculty.map((item) => { const workload = facultyWorkload(item.id); return <button key={item.id} type="button" onClick={() => updateDraft({ facultyId: item.id })} className={`rounded-lg border p-4 text-left transition ${draft.facultyId === item.id ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-secondary'}`}><p className="font-bold text-text">{item.full_name}</p><p className="mt-1 text-sm text-muted">{item.employee_or_register_number ?? 'Employee ID unavailable'}</p><div className="mt-3 flex flex-wrap gap-2"><Badge>{item.designation ?? 'Faculty'}</Badge><Badge tone={workload >= workloadWarningHours ? 'warning' : 'success'}>{workload} hrs/week</Badge></div></button> })}
        {!eligibleFaculty.length && <div className="md:col-span-2 xl:col-span-3"><EmptyState title="No eligible Faculty found" description="Faculty must be active in the selected department." /></div>}
      </div>}

      {step === 4 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Allocation Type"><Select value={draft.allocationType} onChange={(event) => updateDraft({ allocationType: event.target.value as SubjectAssignmentType })}><option value="subject_faculty">Subject Faculty</option>{isLaboratorySubject(selectedSubject) && <option value="lab_faculty">Lab Faculty</option>}</Select></Field>
        <Field label="Assigned Weekly Hours"><Input type="number" min="1" max={selectedSubject?.weekly_hours} value={draft.weeklyHours} onChange={(event) => updateDraft({ weeklyHours: event.target.value })} /></Field>
        <Field label="Effective From"><Input type="date" value={draft.effectiveFrom} onChange={(event) => updateDraft({ effectiveFrom: event.target.value, facultyId: '' })} /></Field>
        <Field label="Effective To"><Input type="date" value={draft.effectiveTo} onChange={(event) => updateDraft({ effectiveTo: event.target.value, facultyId: '' })} /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.isActive} onChange={(event) => updateDraft({ isActive: event.target.checked })} /> Active allocation</label>
        {workloadWarning && <p className="md:col-span-2 xl:col-span-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning"><AlertTriangle className="size-4" /> {workloadWarning}</p>}
      </div>}

      {step === 5 && <div className="grid gap-3 md:grid-cols-2">
        <Summary label="Academic Year" value={selectedYear?.name} />
        <Summary label="Semester" value={selectedSemester ? `Semester ${selectedSemester.number}` : ''} />
        <Summary label="Study Year" value={draft.studyYear ? `Year ${draft.studyYear}` : ''} />
        <Summary label="Section" value={selectedSection ? `${selectedSection.name}${selectedSection.batch ? ` - Batch ${selectedSection.batch}` : ''}` : ''} />
        <Summary label="Subject" value={selectedSubject ? `${selectedSubject.code} - ${selectedSubject.name}` : ''} />
        <Summary label="Faculty" value={selectedFaculty ? `${selectedFaculty.full_name} (${selectedFaculty.employee_or_register_number ?? 'Employee ID unavailable'})` : ''} />
        <Summary label="Allocation Type" value={allocationLabel(draft.allocationType)} />
        <Summary label="Weekly Hours" value={draft.weeklyHours ? `${draft.weeklyHours} hrs/week` : ''} />
        <Summary label="Effective Dates" value={draft.effectiveFrom ? dateRange(draft.effectiveFrom, draft.effectiveTo) : ''} />
        <Summary label="Status" value={draft.isActive ? 'Active' : 'Inactive'} />
      </div>}
      </div>

      {message && <p className={`mt-5 text-sm ${message.tone === 'success' ? 'text-success' : message.tone === 'warning' ? 'text-warning' : 'text-error'}`}>{message.text}</p>}
      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <Button variant="secondary" disabled={step === 1 || saving} onClick={() => setStep((current) => Math.max(current - 1, 1))}><ArrowLeft className="size-4" /> Back</Button>
        {step < workflowSteps.length ? <Button disabled={saving} onClick={next}>Next <ArrowRight className="size-4" /></Button> : <Button disabled={saving} onClick={() => void save()}>{saving ? <><Save className="size-4" /> Saving...</> : <><CheckCircle2 className="size-4" /> Confirm and Save</>}</Button>}
      </div>
    </Card>

    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-bold text-text">Allocation Management</h2><p className="text-sm text-muted">Search, edit, or deactivate current and historical Subject allocations.</p></div>
        <Badge tone="primary">{filteredAllocations.length} shown</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="relative xl:col-span-2"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input className="pl-9" placeholder="Search allocations" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <Select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option value="all">All Academic Years</option>{activeYears.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <Select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}><option value="all">All Semesters</option>{data.semesters.filter((item) => data.academicYears.find((academicYear) => academicYear.id === item.academic_year_id)?.department_id === aiDepartment.id).map((item) => <option key={item.id} value={item.id}>Semester {item.number}</option>)}</Select>
        <Select value={studyYearFilter} onChange={(event) => setStudyYearFilter(event.target.value)}><option value="all">All Study Years</option>{studyYears.map((item) => <option key={item} value={item}>Year {item}</option>)}</Select>
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All Statuses</option></Select>
        <Select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}><option value="all">All Sections</option>{data.sections.filter((item) => item.department_id === aiDepartment.id).map((item) => <option key={item.id} value={item.id}>{item.name}{item.batch ? ` - ${item.batch}` : ''}</option>)}</Select>
        <Select value={facultyFilter} onChange={(event) => setFacultyFilter(event.target.value)}><option value="all">All Faculty</option>{data.profiles.filter((item) => item.role === 'faculty' && item.department_id === aiDepartment.id).map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</Select>
      </div>
      <div className="mt-5"><DataTable rows={filteredAllocations} empty={<EmptyState title="No allocations match the filters" description="Create a Subject allocation or adjust the filters." />} columns={[
        { header: 'Academic Context', render: (item) => { const rowSection = section(item.section_id); return <div><p className="font-semibold">{year(item.academic_year_id)?.name ?? 'Unknown year'} - Semester {semester(item.semester_id)?.number ?? '-'}</p><p className="text-xs text-muted">Year {rowSection?.year_number ?? '-'} - {rowSection?.name ?? 'Unknown section'}{rowSection?.batch ? ` - ${rowSection.batch}` : ''}</p></div> } },
        { header: 'Subject', render: (item) => { const rowSubject = subject(item.subject_id); return <div><p className="font-semibold">{rowSubject?.code ?? 'No code'}</p><p className="text-xs text-muted">{rowSubject?.name ?? 'Unknown subject'}</p></div> } },
        { header: 'Faculty', render: (item) => { const rowProfile = profile(item.faculty_id); return <div><p className="font-semibold">{rowProfile?.full_name ?? 'Unknown Faculty'}</p><p className="text-xs text-muted">{rowProfile?.employee_or_register_number ?? 'Employee ID unavailable'}</p></div> } },
        { header: 'Allocation', render: (item) => <div><Badge tone={item.assignment_type === 'lab_faculty' ? 'warning' : 'primary'}>{allocationLabel(item.assignment_type)}</Badge><p className="mt-1 text-xs text-muted">{item.weekly_hours} hrs/week</p></div> },
        { header: 'Effective Dates', render: (item) => <span>{dateRange(item.effective_from, item.effective_to)}</span> },
        { header: 'Status', render: (item) => <Badge tone={item.is_active ? 'success' : 'muted'}>{item.is_active ? 'Active' : 'Inactive'}</Badge> },
        { header: 'Actions', render: (item) => <div className="flex gap-2"><Button aria-label="Edit allocation" title="Edit allocation" className="min-h-8 px-2" variant="ghost" disabled={saving} onClick={() => edit(item)}><Pencil className="size-4" /></Button><Button aria-label="Deactivate allocation" title="Deactivate allocation" className="min-h-8 px-2 text-error" variant="ghost" disabled={saving || !item.is_active} onClick={() => void deactivate(item.id)}><Power className="size-4" /></Button></div> },
      ]} /></div>
    </Card>
  </div>
}

function Field({ label, children }: { label: string; children: import('react').ReactNode }) {
  return <label className="block text-sm font-semibold text-text">{label}<span className="mt-1 block">{children}</span></label>
}

function Summary({ label, value }: { label: string; value?: string }) {
  return <div className="rounded-lg border border-border bg-background p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 font-semibold text-text">{value || 'Not selected'}</p></div>
}
