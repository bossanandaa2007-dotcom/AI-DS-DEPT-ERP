import { CheckCheck, LockKeyhole, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'

import { DataTable } from '@/components/common/DataTable'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import {
  marksRepository,
  type AssessmentInput,
  type AssessmentRow,
  type AssessmentType,
  type DraftMarkInput,
  type MarkCorrectionRow,
  type MarkRow,
  type MarksData,
} from '@/services/supabase/marksRepository'

const assessmentTypes: AssessmentType[] = ['internal_test', 'assignment', 'quiz', 'practical', 'model_exam']
const today = () => new Date().toISOString().slice(0, 10)
const readable = (value: string) => value.replaceAll('_', ' ')
const tone = (status: string): 'success' | 'warning' | 'primary' | 'muted' => status === 'finalized' || status === 'approved' ? 'success' : status === 'draft' || status === 'pending' ? 'warning' : status === 'rejected' ? 'muted' : 'primary'

interface FeedbackValue {
  text: string
  error: boolean
}

interface MarkDraft {
  value: string
  absent: boolean
  entered: boolean
}

interface AssessmentContext {
  sectionId: string
  subjectId: string
}

interface HodAssessmentRow {
  id: string
  assessment: AssessmentRow
  students: number
  entered: number
  absent: number
  missing: number
  average: number | null
}

interface HodStudentMarkRow {
  id: string
  student: string
  registerNumber: string
  section: string
  assessment: string
  subject: string
  faculty: string
  score: string
  percentage: number | null
  status: AssessmentRow['status']
}

export function MarksPage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => marksRepository.loadMarksData(), [])
  const resource = useAsyncResource(load)
  if (resource.isLoading) return <LoadingState label="Loading marks…" />
  if (resource.error) return <div className="space-y-4"><ErrorState title="Unable to load marks" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  if (!currentUser || !resource.data) return null
  const props = { data: resource.data, reload: resource.reload, userId: currentUser.id }
  if (currentUser.role === 'student') return <StudentMarks {...props} />
  if (currentUser.role === 'faculty') return <FacultyMarks {...props} />
  if (currentUser.role === 'hod') return <HodMarks {...props} />
  return <ErrorState title="Marks unavailable" description="This role does not have a Marks workflow." />
}

function FacultyMarks({ data, reload, userId }: ViewProps) {
  const assignments = data.assignments.filter((row) => row.faculty_id === userId && row.is_active)
  const contexts = assignmentContexts(data, assignments)
  const accessible = data.assessments.filter((assessment) => contexts.some((context) => context.sectionId === assessment.section_id && context.subjectId === assessment.subject_id))
  const classTeacherSectionIds = new Set(assignments.filter((row) => row.assignment_type === 'class_teacher').map((row) => row.section_id))
  const classTeacherAssessments = accessible.filter((assessment) => classTeacherSectionIds.has(assessment.section_id))
  const [selectedId, setSelectedId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, MarkDraft>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AssessmentRow | null>(null)
  const [assessmentDraft, setAssessmentDraft] = useState<AssessmentInput>(() => emptyAssessment(contexts[0]))
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [finalizeTarget, setFinalizeTarget] = useState<AssessmentRow | null>(null)
  const selected = accessible.find((row) => row.id === selectedId)
  const students = selected ? activeStudents(data, selected.section_id) : []
  const selectedMarks = data.marks.filter((row) => row.assessment_id === selected?.id)
  const pending = data.corrections.filter((correction) => {
    const mark = data.marks.find((row) => row.id === correction.mark_id)
    const assessment = data.assessments.find((row) => row.id === mark?.assessment_id)
    return correction.status === 'pending' && assessment?.faculty_id === userId
  })

  const selectAssessment = (assessment: AssessmentRow) => {
    const next: Record<string, MarkDraft> = {}
    for (const student of activeStudents(data, assessment.section_id)) {
      const mark = data.marks.find((row) => row.assessment_id === assessment.id && row.student_id === student.id)
      next[student.id] = { value: mark?.obtained_marks?.toString() ?? '', absent: mark?.absent ?? false, entered: Boolean(mark) }
    }
    setSelectedId(assessment.id)
    setDrafts(next)
    setFeedback(null)
  }
  const openCreate = () => {
    setEditing(null)
    setAssessmentDraft(emptyAssessment(contexts[0]))
    setFormOpen(true)
  }
  const openEdit = (assessment: AssessmentRow) => {
    setEditing(assessment)
    setAssessmentDraft({
      id: assessment.id,
      title: assessment.title,
      assessmentType: assessment.assessment_type,
      subjectId: assessment.subject_id,
      sectionId: assessment.section_id,
      maximumMarks: assessment.maximum_marks,
      assessmentDate: assessment.assessment_date,
    })
    setFormOpen(true)
  }
  const saveAssessment = async () => {
    setSaving(true); setFeedback(null)
    try {
      const saved = await marksRepository.saveAssessment(assessmentDraft)
      await reload()
      setFormOpen(false)
      setSelectedId(saved.id)
      setDrafts({})
      setFeedback({ text: editing ? 'Assessment updated successfully.' : 'Assessment created successfully.', error: false })
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Unable to save the assessment.', error: true })
    } finally { setSaving(false) }
  }
  const setMarkDraft = (studentId: string, change: Partial<MarkDraft>) => {
    setDrafts((current) => {
      const previous = current[studentId] ?? { value: '', absent: false, entered: false }
      return { ...current, [studentId]: { ...previous, ...change } }
    })
  }
  const saveMarks = async () => {
    if (!selected) return
    const inputs: DraftMarkInput[] = students.map((student) => {
      const draft = drafts[student.id] ?? { value: '', absent: false, entered: false }
      return { studentId: student.id, obtainedMarks: draft.value === '' ? null : Number(draft.value), absent: draft.absent, entered: draft.entered }
    })
    setSaving(true); setFeedback(null)
    try {
      await marksRepository.saveDraftMarks(selected.id, inputs)
      await reload()
      setFeedback({ text: 'Draft marks saved successfully.', error: false })
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Unable to save marks.', error: true })
    } finally { setSaving(false) }
  }
  const finalize = async () => {
    if (!finalizeTarget) return
    setSaving(true); setFeedback(null)
    try {
      await marksRepository.finalizeMarks(finalizeTarget.id)
      await reload()
      setFinalizeTarget(null)
      setFeedback({ text: 'Marks finalized and locked successfully.', error: false })
    } catch (error) {
      setFinalizeTarget(null)
      setFeedback({ text: error instanceof Error ? error.message : 'Unable to finalize marks.', error: true })
    } finally { setSaving(false) }
  }

  return <div className="space-y-6">
    <PageHeader title="Assessments and marks" description="Live assessments, active enrollments, draft entry, finalization, and correction review." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button><Button disabled={!contexts.length} onClick={openCreate}><Plus className="size-4" /> Create assessment</Button></div>} />
    {feedback && <Feedback value={feedback} />}
    {!contexts.length && <ErrorState title="No active Marks assignment" description="Assessment and mark actions require an active subject/section or Class Teacher assignment." />}
    <Card>
      <h2 className="font-bold text-text">Assigned assessments</h2>
      <div className="mt-4"><DataTable rows={accessible} empty={<EmptyState title="No assigned assessments" />} columns={[
        { header: 'Assessment', render: (row) => <button className="text-left font-semibold text-secondary" onClick={() => selectAssessment(row)}>{row.title}</button> },
        { header: 'Subject / section', render: (row) => <div><p>{subjectName(data, row.subject_id)}</p><p className="text-xs text-muted">{sectionName(data, row.section_id)}</p></div> },
        { header: 'Maximum', render: (row) => row.maximum_marks },
        { header: 'Date', render: (row) => row.assessment_date },
        { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{readable(row.status)}</Badge> },
        { header: 'Edit', render: (row) => row.faculty_id === userId && row.status !== 'finalized' ? <Button className="min-h-8 px-2" variant="ghost" onClick={() => openEdit(row)}><Pencil className="size-4" /> Edit</Button> : <span className="text-muted">—</span> },
      ]} /></div>
    </Card>
    {selected && <MarksEntryCard assessment={selected} data={data} students={students} marks={selectedMarks} drafts={drafts} saving={saving} canFinalize={selected.faculty_id === userId} onChange={setMarkDraft} onSave={saveMarks} onFinalize={setFinalizeTarget} />}
    {classTeacherSectionIds.size > 0 && <ClassTeacherView data={data} assessments={classTeacherAssessments} />}
    <CorrectionReview data={data} corrections={pending} reload={reload} reviewer="faculty" />
    <AssessmentDialog isOpen={formOpen} editing={editing} draft={assessmentDraft} contexts={contexts} data={data} saving={saving} onChange={setAssessmentDraft} onClose={() => setFormOpen(false)} onSave={saveAssessment} />
    <ConfirmDialog isOpen={Boolean(finalizeTarget)} title="Finalize marks?" description="Every active enrolled student must have a mark or Absent record. Finalized records are read-only and later changes require an approved correction." confirmLabel={saving ? 'Finalizing…' : 'Finalize and lock'} onCancel={() => setFinalizeTarget(null)} onConfirm={() => void finalize()} />
  </div>
}

function MarksEntryCard({ assessment, data, students, marks, drafts, saving, canFinalize, onChange, onSave, onFinalize }: {
  assessment: AssessmentRow
  data: MarksData
  students: MarksData['profiles']
  marks: MarkRow[]
  drafts: Record<string, MarkDraft>
  saving: boolean
  canFinalize: boolean
  onChange: (studentId: string, change: Partial<MarkDraft>) => void
  onSave: () => Promise<void>
  onFinalize: (assessment: AssessmentRow) => void
}) {
  const locked = assessment.status === 'finalized'
  const absent = marks.filter((row) => row.absent).length
  const entered = marks.length - absent
  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-text">{assessment.title}</h2><p className="text-sm text-muted">{subjectName(data, assessment.subject_id)} · {sectionName(data, assessment.section_id)} · Maximum {assessment.maximum_marks}</p></div><Badge tone={tone(assessment.status)}>{locked ? <><LockKeyhole className="mr-1 size-3" /> Locked</> : readable(assessment.status)}</Badge></div>
    <div className="mt-4 grid grid-cols-3 gap-3"><Summary label="Entered" value={entered} /><Summary label="Absent" value={absent} /><Summary label="Not entered" value={Math.max(0, students.length - marks.length)} /></div>
    <div className="mt-4"><DataTable rows={students} empty={<EmptyState title="No active enrolled students" />} columns={[
      { header: 'Student', render: (student) => <div><p className="font-semibold">{student.full_name}</p><p className="text-xs text-muted">{student.employee_or_register_number ?? '—'}</p></div> },
      { header: 'Marks', render: (student) => {
        const mark = marks.find((row) => row.student_id === student.id)
        const draft = drafts[student.id] ?? { value: '', absent: false, entered: false }
        if (locked) return mark ? (mark.absent ? 'Absent' : `${mark.obtained_marks} / ${assessment.maximum_marks}`) : 'Not entered'
        return <Input className="min-w-24" type="number" min="0" max={assessment.maximum_marks} step="0.01" disabled={draft.absent || saving} value={draft.value} placeholder="Not entered" onChange={(event) => onChange(student.id, { value: event.target.value, entered: event.target.value !== '', absent: false })} />
      } },
      { header: 'Attendance state', render: (student) => {
        const mark = marks.find((row) => row.student_id === student.id)
        const draft = drafts[student.id] ?? { value: '', absent: false, entered: false }
        if (locked) return <Badge tone={mark?.absent ? 'muted' : 'primary'}>{mark?.absent ? 'Absent' : mark ? 'Present' : 'Not entered'}</Badge>
        return <Select disabled={saving} value={draft.absent ? 'absent' : draft.entered ? 'present' : 'not_entered'} onChange={(event) => {
          if (event.target.value === 'absent') onChange(student.id, { absent: true, entered: true, value: '' })
          else if (event.target.value === 'not_entered') onChange(student.id, { absent: false, entered: false, value: '' })
          else onChange(student.id, { absent: false, entered: draft.value !== '' })
        }}><option value="not_entered">Not entered</option><option value="present">Present</option><option value="absent">Absent</option></Select>
      } },
    ]} /></div>
    {!locked && <div className="mt-5 flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => void onSave()}><Pencil className="size-4" /> {saving ? 'Saving…' : 'Save draft'}</Button><Button disabled={saving || !canFinalize} title={canFinalize ? undefined : 'Only the assessment owner can finalize.'} onClick={() => onFinalize(assessment)}><CheckCheck className="size-4" /> Review and finalize</Button></div>}
  </Card>
}

function StudentMarks({ data, reload, userId }: ViewProps) {
  const enrollmentSectionIds = new Set(data.enrollments.filter((row) => row.student_id === userId && row.status === 'active').map((row) => row.section_id))
  const assessments = data.assessments.filter((row) => enrollmentSectionIds.has(row.section_id) && row.status === 'finalized')
  const [target, setTarget] = useState<MarkRow | null>(null)
  const [requested, setRequested] = useState('')
  const [absent, setAbsent] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null)
  const pendingMarkIds = new Set(data.corrections.filter((row) => row.status === 'pending').map((row) => row.mark_id))
  const scored = assessments.map((assessment) => ({ assessment, mark: data.marks.find((row) => row.assessment_id === assessment.id && row.student_id === userId) }))
  const markRows = scored.map((row) => ({ id: row.assessment.id, ...row }))
  const percentages = scored.filter((row) => row.mark && !row.mark.absent).map((row) => (Number(row.mark?.obtained_marks ?? 0) / row.assessment.maximum_marks) * 100)
  const average = percentages.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) : null

  const openCorrection = (mark: MarkRow) => {
    setTarget(mark)
    setRequested(mark.obtained_marks?.toString() ?? '')
    setAbsent(mark.absent)
    setReason('')
    setFeedback(null)
  }
  const submit = async () => {
    if (!target) return
    setSaving(true); setFeedback(null)
    try {
      await marksRepository.requestCorrection(target, absent ? null : requested === '' ? null : Number(requested), reason)
      await reload()
      setTarget(null)
      setFeedback({ text: 'Mark correction request submitted successfully.', error: false })
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Unable to submit the correction.', error: true })
    } finally { setSaving(false) }
  }

  return <div className="space-y-6">
    <PageHeader title="My marks" description="Finalized personal assessment marks and correction history from live academic records." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    {feedback && <Feedback value={feedback} />}
    <div className="grid gap-4 sm:grid-cols-2"><Summary label="Finalized assessments" value={assessments.length} large /><Summary label="Average scored percentage" value={average === null ? '—' : `${average}%`} large /></div>
    <Card><h2 className="font-bold text-text">Personal assessment marks</h2><div className="mt-4 hidden md:block"><DataTable rows={markRows} empty={<EmptyState title="No finalized marks available" />} columns={[
      { header: 'Assessment', render: (row) => <div><p className="font-semibold">{row.assessment.title}</p><p className="text-xs text-muted">{subjectName(data, row.assessment.subject_id)} · {row.assessment.assessment_date}</p></div> },
      { header: 'Mark', render: (row) => row.mark ? row.mark.absent ? 'Absent' : `${row.mark.obtained_marks} / ${row.assessment.maximum_marks}` : 'Not entered' },
      { header: 'Percentage', render: (row) => row.mark && !row.mark.absent ? `${Math.round((Number(row.mark.obtained_marks) / row.assessment.maximum_marks) * 100)}%` : '—' },
      { header: 'Correction', render: (row) => !row.mark ? <span className="text-muted">Unavailable</span> : pendingMarkIds.has(row.mark.id) ? <Badge tone="warning">Pending</Badge> : <Button className="min-h-8 px-3" variant="secondary" onClick={() => openCorrection(row.mark!)}>Request</Button> },
    ]} /></div><div className="mt-4 grid gap-3 md:hidden">{markRows.length ? markRows.map((row) => <StudentMarkCard key={row.id} row={row} data={data} pendingMarkIds={pendingMarkIds} onCorrection={openCorrection} />) : <EmptyState title="No finalized marks available" />}</div></Card>
    <CorrectionHistory data={data} corrections={data.corrections.filter((row) => row.student_id === userId)} />
    <Modal isOpen={Boolean(target)} title="Request mark correction" onClose={() => setTarget(null)}>
      <label className="block text-sm font-semibold">Requested state<Select className="mt-1" value={absent ? 'absent' : 'mark'} onChange={(event) => setAbsent(event.target.value === 'absent')}><option value="mark">Corrected mark</option><option value="absent">Absent</option></Select></label>
      {!absent && <label className="mt-4 block text-sm font-semibold">Corrected mark<Input className="mt-1" type="number" min="0" step="0.01" value={requested} onChange={(event) => setRequested(event.target.value)} /></label>}
      <label className="mt-4 block text-sm font-semibold">Reason<Textarea className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button disabled={saving} onClick={() => void submit()}>{saving ? 'Submitting…' : 'Submit request'}</Button></div>
    </Modal>
  </div>
}

function HodMarks({ data, reload, userId }: ViewProps) {
  const [yearId, setYearId] = useState('all')
  const [sectionId, setSectionId] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [facultyId, setFacultyId] = useState('all')
  const [studentId, setStudentId] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const hodProfile = data.profiles.find((profile) => profile.id === userId)
  const departmentId = hodProfile?.department_id ?? data.sections[0]?.department_id
  const departmentSections = data.sections.filter((section) => !departmentId || section.department_id === departmentId)
  const filteredSections = departmentSections.filter((section) => yearId === 'all' || section.academic_year_id === yearId)
  const sectionIds = new Set(filteredSections.map((section) => section.id))
  const assessments = data.assessments.filter((assessment) => sectionIds.has(assessment.section_id) && (sectionId === 'all' || assessment.section_id === sectionId) && (subjectFilter === 'all' || assessment.subject_id === subjectFilter) && (facultyId === 'all' || assessment.faculty_id === facultyId) && (statusFilter === 'all' || assessment.status === statusFilter))
  const filtered = assessments
  const assessmentRows = buildHodAssessmentRows(data, assessments)
  const studentRows = buildHodStudentMarkRows(data, assessments).filter((row) => studentId === 'all' || row.id.startsWith(`${studentId}-`))
  const corrections = data.corrections.filter((correction) => {
    const mark = data.marks.find((row) => row.id === correction.mark_id)
    return assessments.some((assessment) => assessment.id === mark?.assessment_id)
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const enteredMarks = data.marks.filter((mark) => assessments.some((assessment) => assessment.id === mark.assessment_id))
  const scored = enteredMarks.filter((mark) => !mark.absent && mark.obtained_marks !== null)
  const average = scored.length ? scored.reduce((sum, mark) => {
    const assessment = assessments.find((row) => row.id === mark.assessment_id)
    return sum + (assessment ? (Number(mark.obtained_marks) / Number(assessment.maximum_marks)) * 100 : 0)
  }, 0) / scored.length : null
  const departmentSubjects = data.subjects.filter((subject) => !departmentId || subject.department_id === departmentId)
  const departmentFaculty = data.profiles.filter((profile) => (profile.role === 'faculty' || profile.role === 'hod') && (!departmentId || profile.department_id === departmentId))
  const departmentStudents = data.profiles.filter((profile) => profile.role === 'student' && profile.status === 'active' && data.enrollments.some((enrollment) => enrollment.student_id === profile.id && enrollment.status === 'active' && sectionIds.has(enrollment.section_id)))
  return <div className="space-y-6">
    <PageHeader title="Department marks overview" description="Department-wide marks by year, section, subject, faculty, student, assessment status, and correction history." actions={<Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    <Card><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><label className="text-xs font-semibold text-muted">Year<Select className="mt-1" value={yearId} onChange={(event) => { setYearId(event.target.value); setSectionId('all') }}><option value="all">All years</option>{data.academicYears.filter((year) => !departmentId || year.department_id === departmentId).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></label><label className="text-xs font-semibold text-muted">Section<Select className="mt-1" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="all">All sections</option>{filteredSections.map((section) => <option key={section.id} value={section.id}>Year {section.year_number} · {section.name}</option>)}</Select></label><label className="text-xs font-semibold text-muted">Subject<Select className="mt-1" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{departmentSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>)}</Select></label><label className="text-xs font-semibold text-muted">Faculty<Select className="mt-1" value={facultyId} onChange={(event) => setFacultyId(event.target.value)}><option value="all">All faculty</option>{departmentFaculty.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</Select></label><label className="text-xs font-semibold text-muted">Student<Select className="mt-1" value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="all">All students</option>{departmentStudents.map((profile) => <option key={profile.id} value={profile.id}>{profile.employee_or_register_number ?? 'No ID'} · {profile.full_name}</option>)}</Select></label><label className="text-xs font-semibold text-muted">Status<Select className="mt-1" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="completed">Completed</option><option value="finalized">Finalized</option></Select></label></div></Card>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Summary label="Assessments" value={assessments.length} large /><Summary label="Finalized" value={assessments.filter((row) => row.status === 'finalized').length} large /><Summary label="Entered marks" value={enteredMarks.length} large /><Summary label="Average score" value={average === null ? '—' : `${average.toFixed(1)}%`} large /><Summary label="Pending corrections" value={corrections.filter((row) => row.status === 'pending').length} large /></div>
    <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-text">Department assessments</h2><p className="text-sm text-muted">HOD has reporting visibility; direct mark entry remains assignment-restricted.</p></div><Select className="w-full sm:w-64" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>)}</Select></div><div className="mt-4"><DataTable rows={filtered} empty={<EmptyState title="No assessments match this filter" />} columns={[
      { header: 'Assessment', render: (row) => <div><p className="font-semibold">{row.title}</p><p className="text-xs text-muted">{readable(row.assessment_type)} · {row.assessment_date}</p></div> },
      { header: 'Subject / section', render: (row) => `${subjectName(data, row.subject_id)} · ${sectionName(data, row.section_id)}` },
      { header: 'Faculty', render: (row) => profileName(data, row.faculty_id) },
      { header: 'Records', render: (row) => data.marks.filter((mark) => mark.assessment_id === row.id).length },
      { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{readable(row.status)}</Badge> },
    ]} /></div></Card>
    <Card><h2 className="font-bold text-text">Assessment totals</h2><div className="mt-4"><DataTable rows={assessmentRows} empty={<EmptyState title="No assessments match these filters" />} columns={[
      { header: 'Assessment', render: (row) => <div><p className="font-semibold">{row.assessment.title}</p><p className="text-xs text-muted">{readable(row.assessment.assessment_type)} · {row.assessment.assessment_date}</p></div> },
      { header: 'Subject / section', render: (row) => `${subjectName(data, row.assessment.subject_id)} · ${sectionName(data, row.assessment.section_id)}` },
      { header: 'Faculty', render: (row) => profileName(data, row.assessment.faculty_id) },
      { header: 'Max', render: (row) => row.assessment.maximum_marks },
      { header: 'Entered', render: (row) => row.entered },
      { header: 'Absent', render: (row) => row.absent },
      { header: 'Missing', render: (row) => row.missing },
      { header: 'Average', render: (row) => row.average === null ? '—' : `${row.average.toFixed(1)}%` },
      { header: 'Status', render: (row) => <Badge tone={tone(row.assessment.status)}>{readable(row.assessment.status)}</Badge> },
    ]} /></div></Card>
    <Card><h2 className="font-bold text-text">Student mark records</h2><div className="mt-4"><DataTable rows={studentRows} empty={<EmptyState title="No student mark records match these filters" />} columns={[
      { header: 'Student', render: (row) => <div><p className="font-semibold">{row.student}</p><p className="text-xs text-muted">{row.registerNumber || 'No register number'}</p></div> },
      { header: 'Section', render: (row) => row.section },
      { header: 'Assessment', render: (row) => <div><p>{row.assessment}</p><p className="text-xs text-muted">{row.subject}</p></div> },
      { header: 'Faculty', render: (row) => row.faculty },
      { header: 'Score', render: (row) => row.score },
      { header: 'Percentage', render: (row) => row.percentage === null ? '—' : `${row.percentage.toFixed(1)}%` },
      { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{readable(row.status)}</Badge> },
    ]} /></div></Card>
    <CorrectionReview data={data} corrections={corrections} reload={reload} reviewer="hod" />
  </div>
}

function buildHodAssessmentRows(data: MarksData, assessments: AssessmentRow[]): HodAssessmentRow[] {
  return assessments.map((assessment) => {
    const students = activeStudents(data, assessment.section_id)
    const marks = data.marks.filter((mark) => mark.assessment_id === assessment.id)
    const scored = marks.filter((mark) => !mark.absent && mark.obtained_marks !== null)
    const average = scored.length ? scored.reduce((sum, mark) => sum + (Number(mark.obtained_marks) / Number(assessment.maximum_marks)) * 100, 0) / scored.length : null
    return { id: assessment.id, assessment, students: students.length, entered: marks.length, absent: marks.filter((mark) => mark.absent).length, missing: Math.max(0, students.length - marks.length), average }
  })
}

function buildHodStudentMarkRows(data: MarksData, assessments: AssessmentRow[]): HodStudentMarkRow[] {
  return assessments.flatMap((assessment) => activeStudents(data, assessment.section_id).map((student) => {
    const mark = data.marks.find((row) => row.assessment_id === assessment.id && row.student_id === student.id)
    const percent = mark && !mark.absent && mark.obtained_marks !== null ? (Number(mark.obtained_marks) / Number(assessment.maximum_marks)) * 100 : null
    return { id: `${student.id}-${assessment.id}`, student: student.full_name, registerNumber: student.employee_or_register_number ?? '', section: sectionName(data, assessment.section_id), assessment: assessment.title, subject: subjectName(data, assessment.subject_id), faculty: profileName(data, assessment.faculty_id), score: mark ? mark.absent ? 'Absent' : `${mark.obtained_marks} / ${assessment.maximum_marks}` : 'Not entered', percentage: percent, status: assessment.status }
  })).sort((first, second) => `${first.section}-${first.student}-${first.assessment}`.localeCompare(`${second.section}-${second.student}-${second.assessment}`))
}

function StudentMarkCard({ row, data, pendingMarkIds, onCorrection }: { row: { id: string; assessment: AssessmentRow; mark?: MarkRow }; data: MarksData; pendingMarkIds: Set<string>; onCorrection: (mark: MarkRow) => void }) {
  const percent = row.mark && !row.mark.absent ? `${Math.round((Number(row.mark.obtained_marks) / row.assessment.maximum_marks) * 100)}%` : '-'
  return <article className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-bold text-text">{row.assessment.title}</h3><p className="mt-1 text-xs text-muted">{subjectName(data, row.assessment.subject_id)} - {row.assessment.assessment_date}</p></div><Badge tone={row.mark ? 'success' : 'muted'}>{row.mark ? row.mark.absent ? 'Absent' : percent : 'Not entered'}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><MiniStat label="Mark" value={row.mark ? row.mark.absent ? 'Absent' : `${row.mark.obtained_marks} / ${row.assessment.maximum_marks}` : 'Unavailable'} /><MiniStat label="Percentage" value={percent} /></div><div className="mt-4">{!row.mark ? <span className="text-sm text-muted">Correction unavailable</span> : pendingMarkIds.has(row.mark.id) ? <Badge tone="warning">Pending correction</Badge> : <Button className="min-h-8 px-3" variant="secondary" onClick={() => onCorrection(row.mark!)}>Request correction</Button>}</div></article>
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="font-medium text-text">{value}</p></div>
}

function CorrectionReview({ data, corrections, reload, reviewer }: { data: MarksData; corrections: MarkCorrectionRow[]; reload: () => Promise<void>; reviewer: 'faculty' | 'hod' }) {
  const [target, setTarget] = useState<{ correction: MarkCorrectionRow; approve: boolean } | null>(null)
  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null)
  const decide = async () => {
    if (!target) return
    setSaving(true); setFeedback(null)
    try {
      await marksRepository.reviewCorrection(target.correction.id, target.approve, comments)
      await reload()
      setTarget(null); setComments('')
      setFeedback({ text: `Correction ${target.approve ? 'approved' : 'rejected'} successfully.`, error: false })
    } catch (error) {
      setTarget(null)
      setFeedback({ text: error instanceof Error ? error.message : 'Unable to review the correction.', error: true })
    } finally { setSaving(false) }
  }
  return <Card>
    <h2 className="font-bold text-text">{reviewer === 'hod' ? 'Department correction history' : 'Mark correction reviews'}</h2>
    {reviewer === 'hod' && <p className="mt-1 text-sm text-warning">The existing review RPC permits the owning assigned Faculty only; HOD review is read-only.</p>}
    {feedback && <div className="mt-3"><Feedback value={feedback} /></div>}
    <div className="mt-4"><DataTable rows={corrections} empty={<EmptyState title={reviewer === 'hod' ? 'No correction history' : 'No pending mark corrections'} />} columns={[
      { header: 'Student / assessment', render: (row) => {
        const mark = data.marks.find((item) => item.id === row.mark_id)
        const assessment = data.assessments.find((item) => item.id === mark?.assessment_id)
        return <div><p className="font-semibold">{profileName(data, row.student_id)}</p><p className="text-xs text-muted">{assessment?.title ?? 'Assessment unavailable'}</p></div>
      } },
      { header: 'Requested change', render: (row) => `${row.original_marks ?? 'Absent'} → ${row.requested_marks ?? 'Absent'}` },
      { header: 'Reason', render: (row) => row.reason },
      { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{row.status}</Badge> },
      { header: reviewer === 'faculty' ? 'Review' : 'Reviewed by', render: (row) => reviewer === 'faculty' && row.status === 'pending' ? <div className="flex gap-2"><Button className="min-h-8 px-2" onClick={() => setTarget({ correction: row, approve: true })}>Approve</Button><Button className="min-h-8 px-2" variant="secondary" onClick={() => setTarget({ correction: row, approve: false })}>Reject</Button></div> : row.reviewer_id ? profileName(data, row.reviewer_id) : '—' },
    ]} /></div>
    <ConfirmDialog isOpen={Boolean(target)} title={`${target?.approve ? 'Approve' : 'Reject'} mark correction?`} description="This decision is recorded by the existing correction RPC. Approval changes the locked mark through the protected correction path." confirmLabel={saving ? 'Saving…' : target?.approve ? 'Approve correction' : 'Reject correction'} onCancel={() => setTarget(null)} onConfirm={() => void decide()}><label className="mt-4 block text-sm font-semibold">Reviewer comments<Textarea className="mt-1" value={comments} onChange={(event) => setComments(event.target.value)} /></label></ConfirmDialog>
  </Card>
}

function CorrectionHistory({ data, corrections }: { data: MarksData; corrections: MarkCorrectionRow[] }) {
  const rows = corrections.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
  return <Card><h2 className="font-bold text-text">Correction history</h2><div className="mt-4 hidden md:block"><DataTable rows={rows} empty={<EmptyState title="No mark correction requests" />} columns={[
    { header: 'Assessment', render: (row) => {
      const mark = data.marks.find((item) => item.id === row.mark_id)
      return data.assessments.find((item) => item.id === mark?.assessment_id)?.title ?? 'Assessment unavailable'
    } },
    { header: 'Change', render: (row) => `${row.original_marks ?? 'Absent'} → ${row.requested_marks ?? 'Absent'}` },
    { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{row.status}</Badge> },
    { header: 'Timeline', render: (row) => <div><p>{new Date(row.created_at).toLocaleString()}</p><p className="text-xs text-muted">{row.reviewed_at ? `Reviewed ${new Date(row.reviewed_at).toLocaleString()}` : 'Awaiting review'}</p></div> },
    { header: 'Comments', render: (row) => row.reviewer_comments ?? '—' },
  ]} /></div><div className="mt-4 grid gap-3 md:hidden">{rows.length ? rows.map((row) => <CorrectionHistoryCard key={row.id} row={row} data={data} />) : <EmptyState title="No mark correction requests" />}</div></Card>
}

function CorrectionHistoryCard({ row, data }: { row: MarkCorrectionRow; data: MarksData }) {
  const mark = data.marks.find((item) => item.id === row.mark_id)
  const assessment = data.assessments.find((item) => item.id === mark?.assessment_id)
  return <article className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-text">{assessment?.title ?? 'Assessment unavailable'}</h3><p className="mt-1 text-xs text-muted">{new Date(row.created_at).toLocaleString()}</p></div><Badge tone={tone(row.status)}>{row.status}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><MiniStat label="Change" value={`${row.original_marks ?? 'Absent'} -> ${row.requested_marks ?? 'Absent'}`} /><MiniStat label="Review" value={row.reviewed_at ? new Date(row.reviewed_at).toLocaleDateString() : 'Awaiting'} /></div>{row.reviewer_comments && <p className="mt-3 text-sm text-muted">{row.reviewer_comments}</p>}</article>
}

function ClassTeacherView({ data, assessments }: { data: MarksData; assessments: AssessmentRow[] }) {
  return <Card><h2 className="font-bold text-text">Class Teacher marks view</h2><p className="mt-1 text-sm text-muted">All subject assessments in actively assigned Class Teacher sections.</p><div className="mt-4"><DataTable rows={assessments} empty={<EmptyState title="No class assessments available" />} columns={[
    { header: 'Assessment', render: (row) => row.title },
    { header: 'Subject / section', render: (row) => `${subjectName(data, row.subject_id)} · ${sectionName(data, row.section_id)}` },
    { header: 'Entered records', render: (row) => data.marks.filter((mark) => mark.assessment_id === row.id).length },
    { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{readable(row.status)}</Badge> },
  ]} /></div></Card>
}

function AssessmentDialog({ isOpen, editing, draft, contexts, data, saving, onChange, onClose, onSave }: {
  isOpen: boolean
  editing: AssessmentRow | null
  draft: AssessmentInput
  contexts: AssessmentContext[]
  data: MarksData
  saving: boolean
  onChange: (draft: AssessmentInput) => void
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const contextValue = draft.sectionId && draft.subjectId ? `${draft.sectionId}|${draft.subjectId}` : ''
  return <Modal isOpen={isOpen} title={editing ? 'Edit assessment' : 'Create assessment'} onClose={onClose}><div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-semibold sm:col-span-2">Assigned subject and section<Select className="mt-1" value={contextValue} onChange={(event) => { const [sectionId, subjectId] = event.target.value.split('|'); onChange({ ...draft, sectionId, subjectId }) }}><option value="">Select active assignment</option>{contexts.map((context) => <option key={`${context.sectionId}-${context.subjectId}`} value={`${context.sectionId}|${context.subjectId}`}>{subjectName(data, context.subjectId)} · {sectionName(data, context.sectionId)}</option>)}</Select></label>
    <label className="text-sm font-semibold">Title<Input className="mt-1" value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} /></label>
    <label className="text-sm font-semibold">Type<Select className="mt-1" value={draft.assessmentType} onChange={(event) => onChange({ ...draft, assessmentType: event.target.value as AssessmentType })}>{assessmentTypes.map((type) => <option key={type} value={type}>{readable(type)}</option>)}</Select></label>
    <label className="text-sm font-semibold">Maximum marks<Input className="mt-1" type="number" min="0.01" step="0.01" value={draft.maximumMarks} onChange={(event) => onChange({ ...draft, maximumMarks: Number(event.target.value) })} /></label>
    <label className="text-sm font-semibold">Assessment date<Input className="mt-1" type="date" value={draft.assessmentDate} onChange={(event) => onChange({ ...draft, assessmentDate: event.target.value })} /></label>
  </div><div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void onSave()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create assessment'}</Button></div></Modal>
}

function assignmentContexts(data: MarksData, assignments: MarksData['assignments']): AssessmentContext[] {
  const contexts: AssessmentContext[] = []
  for (const assignment of assignments) {
    if (assignment.subject_id) contexts.push({ sectionId: assignment.section_id, subjectId: assignment.subject_id })
    if (assignment.assignment_type === 'class_teacher') {
      const section = data.sections.find((row) => row.id === assignment.section_id)
      for (const subject of data.subjects.filter((row) => row.semester_id === section?.semester_id)) contexts.push({ sectionId: assignment.section_id, subjectId: subject.id })
    }
  }
  return contexts.filter((context, index) => contexts.findIndex((item) => item.sectionId === context.sectionId && item.subjectId === context.subjectId) === index)
}

function activeStudents(data: MarksData, sectionId: string) {
  const studentIds = new Set(data.enrollments.filter((row) => row.section_id === sectionId && row.status === 'active').map((row) => row.student_id))
  return data.profiles.filter((profile) => studentIds.has(profile.id) && profile.role === 'student' && profile.status === 'active')
}

function emptyAssessment(context?: AssessmentContext): AssessmentInput {
  return { title: '', assessmentType: 'internal_test', subjectId: context?.subjectId ?? '', sectionId: context?.sectionId ?? '', maximumMarks: 100, assessmentDate: today() }
}

function subjectName(data: MarksData, id: string) {
  const subject = data.subjects.find((row) => row.id === id)
  return subject ? `${subject.code} · ${subject.name}` : 'Unknown subject'
}

function sectionName(data: MarksData, id: string) {
  const section = data.sections.find((row) => row.id === id)
  return section ? `Year ${section.year_number} · ${section.name}` : 'Unknown section'
}

function profileName(data: MarksData, id: string) {
  return data.profiles.find((row) => row.id === id)?.full_name ?? 'Profile unavailable'
}

function Summary({ label, value, large = false }: { label: string; value: number | string; large?: boolean }) {
  return <Card className={large ? undefined : 'p-3'}><p className="text-xs text-muted">{label}</p><p className={`${large ? 'mt-1 text-3xl' : 'text-xl'} font-bold text-text`}>{value}</p></Card>
}

function Feedback({ value }: { value: FeedbackValue }) {
  return <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${value.error ? 'border-error/30 bg-error/5 text-error' : 'border-success/30 bg-success/5 text-success'}`}>{value.text}</p>
}

interface ViewProps {
  data: MarksData
  reload: () => Promise<void>
  userId: string
}
