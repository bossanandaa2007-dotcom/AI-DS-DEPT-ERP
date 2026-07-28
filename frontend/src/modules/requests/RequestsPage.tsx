import { Eye, FileCheck2, Pencil, Plus, Printer, RefreshCw, Upload } from 'lucide-react'
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
import { PrivateFileInput } from '@/modules/document-reviews/PrivateFileInput'
import { SecureAttachmentPreview as SecurePreview } from '@/modules/document-reviews/SecureAttachmentPreview'
import { useAuth } from '@/modules/auth/useAuth'
import { PRIVATE_FILE_BUCKET } from '@/services/supabase/privateFileRepository'
import {
  requestWorkflowRepository,
  type AttachmentRow,
  type CompetitionInput,
  type CompetitionRow,
  type ProjectInput,
  type ProjectRow,
  type RequestRow,
  type RequestStatus,
  type RequestType,
  type RequestWorkflowData,
} from '@/services/supabase/requestWorkflowRepository'
import type { Json } from '@/types/database.types'

const studentTypes: RequestType[] = ['student_leave', 'gate_pass', 'od']
type StudentTab = 'all' | 'student_leave' | 'gate_pass' | 'od' | 'project' | 'competition'
type StudentWorkflowItem = { id: string; kind: StudentTab; title: string; summary: string; status: string; submitted: string; updated: string; stage: string; request?: RequestRow; project?: ProjectRow; competition?: CompetitionRow; attachments: AttachmentRow[] }
const studentTabs: { value: StudentTab; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'student_leave', label: 'Leave' }, { value: 'gate_pass', label: 'Gate Pass' }, { value: 'od', label: 'OD' }, { value: 'project', label: 'Projects' }, { value: 'competition', label: 'Competitions' }]
const projectStatuses = ['proposed', 'active', 'completed', 'archived']
const competitionTypes = ['hackathon', 'paper_presentation', 'coding', 'project_expo', 'other']
const competitionLevels = ['department', 'college', 'state', 'national', 'international']
const today = () => new Date().toISOString().slice(0, 10)
const display = (value: string) => value.replaceAll('_', ' ')
const tone = (status: string): 'primary' | 'success' | 'warning' | 'muted' => ['hod_approved', 'finalized', 'certificate_verified', 'verified', 'completed'].includes(status) ? 'success' : ['submitted', 'class_teacher_approved', 'faculty_approved', 'provisional_approved', 'certificate_pending', 'pending_faculty_review', 'pending_jury_review'].includes(status) ? 'warning' : ['faculty_rejected', 'hod_rejected', 'rejected', 'cancelled', 'faculty_rejected', 'jury_rejected', 'archived'].includes(status) ? 'muted' : 'primary'

interface FeedbackValue {
  message: string
  error: boolean
}

interface RequestFormState {
  requestType: RequestType
  reason: string
  fromDate: string
  toDate: string
  leaveType: string
  destination: string
  exitTime: string
  returnTime: string
  eventName: string
  organizer: string
  venue: string
  eventDate: string
  projectId: string
  competitionId: string
}

export function RequestsPage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => requestWorkflowRepository.loadData(), [])
  const resource = useAsyncResource(load)
  if (resource.isLoading) return <LoadingState label="Loading requests, projects, and OD workflows…" />
  if (resource.error) return <div className="space-y-4"><ErrorState title="Unable to load request workflows" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  if (!currentUser || !resource.data) return null
  const props = { data: resource.data, reload: resource.reload, userId: currentUser.id }
  if (currentUser.role === 'student') return <StudentWorkspace {...props} />
  if (currentUser.role === 'faculty') return <FacultyWorkspace {...props} />
  if (currentUser.role === 'lab_assistant') return <StaffWorkspace {...props} />
  if (currentUser.role === 'hod') return <HodWorkspace {...props} />
  return <ErrorState title="Workflow unavailable" description="This role has no configured request workflow screen." />
}

function StudentWorkspace({ data, reload, userId }: ViewProps) {
  const [tab, setTab] = useState<StudentTab>('all')
  const [requestOpen, setRequestOpen] = useState(false)
  const [form, setForm] = useState<RequestFormState>(() => emptyRequest('student_leave'))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null)
  const [certificateRequest, setCertificateRequest] = useState<RequestRow | null>(null)
  const [certificate, setCertificate] = useState<File | null>(null)
  const [pass, setPass] = useState<RequestRow | null>(null)
  const [preview, setPreview] = useState<AttachmentRow | null>(null)
  const requests = data.requests.filter((row) => row.requester_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const studentProjectIds = new Set(data.projectMembers.filter((row) => row.student_id === userId).map((row) => row.project_id))
  const projects = data.projects.filter((row) => studentProjectIds.has(row.id))
  const competitions = data.competitions.filter((row) => jsonStringArray(row.details, 'participant_ids').includes(userId))
  const items = studentWorkflowItems(data, requests, projects, competitions)
  const visibleItems = tab === 'all' ? items : items.filter((item) => item.kind === tab)

  const submit = async () => {
    setSaving(true); setFeedback(null)
    try {
      const duplicate = requests.some((request) => request.request_type === form.requestType && ['draft', 'submitted', 'class_teacher_approved', 'faculty_approved', 'provisional_approved', 'certificate_pending', 'certificate_verified'].includes(request.status) && request.from_date && request.to_date && request.from_date <= form.toDate && request.to_date >= form.fromDate)
      if (duplicate) throw new Error('An overlapping active request already exists.')
      await requestWorkflowRepository.createRequest({
        requestType: form.requestType,
        reason: form.reason,
        fromDate: form.fromDate,
        toDate: form.toDate,
        details: requestDetails(form),
      }, file ?? undefined)
      await reload()
      setRequestOpen(false); setFile(null); setForm(emptyRequest('student_leave'))
      setFeedback({ message: 'Request submitted successfully.', error: false })
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Unable to submit the request.', error: true })
    } finally { setSaving(false) }
  }
  const uploadCertificate = async () => {
    if (!certificateRequest || !certificate) { setFeedback({ message: 'Choose a PDF, JPEG, or PNG certificate.', error: true }); return }
    setSaving(true); setFeedback(null)
    try {
      await requestWorkflowRepository.uploadOdCertificate(certificateRequest.id, certificate)
      await reload()
      setCertificateRequest(null); setCertificate(null)
      setFeedback({ message: 'Certificate uploaded for Faculty and Jury verification.', error: false })
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Unable to upload the certificate.', error: true })
    } finally { setSaving(false) }
  }

  return <div className="space-y-6">
    <PageHeader title="Student requests" description="Leave, gate pass, OD, project, and competition workflows in one place." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button><Button onClick={() => setRequestOpen(true)}><Plus className="size-4" /> New request</Button></div>} />
    {feedback && <Feedback value={feedback} />}
    <StudentSummary items={items} />
    <Card><div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{studentTabs.map((item) => <Button key={item.value} className="px-3" variant={tab === item.value ? 'primary' : 'secondary'} onClick={() => setTab(item.value)}>{item.label}</Button>)}</div><div className="space-y-3"><StudentWorkflowList data={data} items={visibleItems} onPreview={setPreview} actions={(request) => <StudentRequestActions request={request} data={data} setPass={setPass} setCertificateRequest={setCertificateRequest} setPreview={setPreview} />} /></div></Card>
    <RequestDialog isOpen={requestOpen} form={form} setForm={setForm} file={file} setFile={setFile} saving={saving} projects={projects} competitions={competitions} onClose={() => setRequestOpen(false)} onSubmit={submit} />
    <CertificateDialog request={certificateRequest} file={certificate} setFile={setCertificate} saving={saving} onClose={() => setCertificateRequest(null)} onSubmit={uploadCertificate} />
    <GatePassDialog request={pass} onClose={() => setPass(null)} />
    {preview && <SecurePreview key={preview.id} attachment={preview} onClose={() => setPreview(null)} />}
  </div>
}

function FacultyWorkspace({ data, reload, userId }: ViewProps) {
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [form, setForm] = useState<RequestFormState>(() => emptyRequest('staff_leave'))
  const [file, setFile] = useState<File | null>(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const [project, setProject] = useState<ProjectInput>(() => emptyProject(userId))
  const [preview, setPreview] = useState<AttachmentRow | null>(null)
  const personal = data.requests.filter((row) => row.requester_id === userId)
  const classTeacherSections = new Set(data.assignments.filter((row) => row.faculty_id === userId && row.is_active && row.assignment_type === 'class_teacher').map((row) => row.section_id))
  const classTeacherStudents = new Set(data.enrollments.filter((row) => classTeacherSections.has(row.section_id) && row.status === 'active').map((row) => row.student_id))
  const reviewQueue = data.requests.filter((request) => {
    if ((request.request_type === 'student_leave' || request.request_type === 'gate_pass') && request.status === 'submitted') return classTeacherStudents.has(request.requester_id)
    if (request.request_type !== 'od' || !['submitted', 'certificate_pending'].includes(request.status)) return false
    const bucket = request.status === 'submitted' ? PRIVATE_FILE_BUCKET.odProof : PRIVATE_FILE_BUCKET.odCertificate
    return data.attachments.some((attachment) => attachment.entity_id === request.id && attachment.bucket_id === bucket && attachment.faculty_reviewer_id === userId)
  })
  const canCreateProject = data.assignments.some((row) => row.faculty_id === userId && row.is_active && row.assignment_type === 'faculty_guide')

  const submitLeave = async () => {
    setSaving(true); setFeedback(null)
    try {
      await requestWorkflowRepository.createRequest({ requestType: 'staff_leave', reason: form.reason, fromDate: form.fromDate, toDate: form.toDate, details: requestDetails(form) }, file ?? undefined)
      await reload(); setRequestOpen(false); setFile(null); setForm(emptyRequest('staff_leave'))
      setFeedback({ message: 'Staff leave request submitted.', error: false })
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : 'Unable to submit leave.', error: true }) } finally { setSaving(false) }
  }
  const review = async () => {
    if (!decision) return
    setSaving(true); setFeedback(null)
    try {
      await requestWorkflowRepository.transition(decision.request.id, decision.status, comments)
      await reload(); setDecision(null); setComments('')
      setFeedback({ message: `Request moved to ${display(decision.status)}.`, error: false })
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : 'Unable to review the request.', error: true }) } finally { setSaving(false) }
  }
  const saveProject = async () => {
    setSaving(true); setFeedback(null)
    try {
      await requestWorkflowRepository.saveProject(project)
      await reload(); setProjectOpen(false); setProject(emptyProject(userId))
      setFeedback({ message: 'Project saved successfully.', error: false })
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : 'Unable to save the project.', error: true }) } finally { setSaving(false) }
  }
  const editProject = (row: ProjectRow) => {
    setProject({ id: row.id, name: row.name, description: row.description, facultyGuideId: userId, status: row.status, memberIds: data.projectMembers.filter((member) => member.project_id === row.id).map((member) => member.student_id) })
    setProjectOpen(true)
  }

  return <div className="space-y-6">
    <PageHeader title="Staff requests and Faculty review" description="Staff leave, assigned student approvals, Faculty Guide projects, and verified OD transitions." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button><Button onClick={() => setRequestOpen(true)}><Plus className="size-4" /> Staff leave</Button>{canCreateProject && <Button variant="secondary" onClick={() => setProjectOpen(true)}><Plus className="size-4" /> Project</Button>}</div>} />
    {feedback && <Feedback value={feedback} />}
    <RequestTable data={data} requests={personal} title="My staff leave history" onPreview={setPreview} />
    <FacultyReviewQueue data={data} requests={reviewQueue} onDecision={setDecision} onPreview={setPreview} />
    <ProjectsTable data={data} userId={userId} onEdit={editProject} />
    <CompetitionsTable data={data} />
    <RequestDialog isOpen={requestOpen} form={form} setForm={setForm} file={file} setFile={setFile} saving={saving} staffOnly projects={[]} competitions={[]} onClose={() => setRequestOpen(false)} onSubmit={submitLeave} />
    <ProjectDialog isOpen={projectOpen} project={project} setProject={setProject} data={data} facultyId={userId} saving={saving} onClose={() => setProjectOpen(false)} onSubmit={saveProject} />
    <DecisionDialog decision={decision} comments={comments} setComments={setComments} saving={saving} onClose={() => setDecision(null)} onSubmit={review} />
    {preview && <SecurePreview key={preview.id} attachment={preview} onClose={() => setPreview(null)} />}
  </div>
}

function StaffWorkspace({ data, reload, userId }: ViewProps) {
  const [form, setForm] = useState<RequestFormState>(() => emptyRequest('staff_leave'))
  const [file, setFile] = useState<File | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null)
  const [preview, setPreview] = useState<AttachmentRow | null>(null)
  const submit = async () => {
    setSaving(true); setFeedback(null)
    try {
      await requestWorkflowRepository.createRequest({ requestType: 'staff_leave', reason: form.reason, fromDate: form.fromDate, toDate: form.toDate, details: requestDetails(form) }, file ?? undefined)
      await reload(); setOpen(false); setFile(null); setForm(emptyRequest('staff_leave'))
      setFeedback({ message: 'Staff leave request submitted.', error: false })
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : 'Unable to submit leave.', error: true }) } finally { setSaving(false) }
  }
  return <div className="space-y-6"><PageHeader title="Staff leave" description="Submit and track personal leave through the HOD approval workflow." actions={<div className="flex gap-2"><Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button><Button onClick={() => setOpen(true)}><Plus className="size-4" /> New leave</Button></div>} />{feedback && <Feedback value={feedback} />}<RequestTable data={data} requests={data.requests.filter((row) => row.requester_id === userId)} title="My leave history" onPreview={setPreview} /><RequestDialog isOpen={open} form={form} setForm={setForm} file={file} setFile={setFile} saving={saving} staffOnly projects={[]} competitions={[]} onClose={() => setOpen(false)} onSubmit={submit} />{preview && <SecurePreview key={preview.id} attachment={preview} onClose={() => setPreview(null)} />}</div>
}

function HodWorkspace({ data, reload, userId }: ViewProps) {
  const [decision, setDecision] = useState<Decision | null>(null)
  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const [project, setProject] = useState<ProjectInput>(() => emptyProject(''))
  const [competitionOpen, setCompetitionOpen] = useState(false)
  const [competition, setCompetition] = useState<CompetitionInput>(() => emptyCompetition())
  const [preview, setPreview] = useState<AttachmentRow | null>(null)
  const queue = data.requests.filter((request) =>
    ((request.request_type === 'student_leave' || request.request_type === 'gate_pass') && request.status === 'class_teacher_approved')
    || (request.request_type === 'staff_leave' && request.status === 'submitted')
    || (request.request_type === 'od' && ['faculty_approved', 'certificate_verified'].includes(request.status))
  )

  const review = async () => {
    if (!decision) return
    setSaving(true); setFeedback(null)
    try {
      await requestWorkflowRepository.transition(decision.request.id, decision.status, comments)
      await reload(); setDecision(null); setComments('')
      setFeedback({ message: `Request moved to ${display(decision.status)}.`, error: false })
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : 'Unable to review the request.', error: true }) } finally { setSaving(false) }
  }
  const saveProject = async () => {
    setSaving(true); setFeedback(null)
    try {
      await requestWorkflowRepository.saveProject(project)
      await reload(); setProjectOpen(false); setProject(emptyProject(''))
      setFeedback({ message: 'Project saved successfully.', error: false })
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : 'Unable to save the project.', error: true }) } finally { setSaving(false) }
  }
  const saveCompetition = async () => {
    setSaving(true); setFeedback(null)
    try {
      await requestWorkflowRepository.saveCompetition(competition)
      await reload(); setCompetitionOpen(false); setCompetition(emptyCompetition())
      setFeedback({ message: 'Competition record saved successfully.', error: false })
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : 'Unable to save the competition.', error: true }) } finally { setSaving(false) }
  }
  const editProject = (row: ProjectRow) => {
    setProject({ id: row.id, name: row.name, description: row.description, facultyGuideId: row.faculty_guide_id ?? '', status: row.status, memberIds: data.projectMembers.filter((member) => member.project_id === row.id).map((member) => member.student_id) })
    setProjectOpen(true)
  }
  const editCompetition = (row: CompetitionRow) => {
    setCompetition({ id: row.id, name: row.name, organizer: row.organizer, venue: row.venue ?? '', eventDate: row.event_date, details: row.details })
    setCompetitionOpen(true)
  }
  return <div className="space-y-6">
    <PageHeader title="Department requests, projects and competitions" description="Department-scoped approval queues, Faculty Guide projects, competition records, and OD finalization." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh</Button><Button onClick={() => { setProject(emptyProject('')); setProjectOpen(true) }}><Plus className="size-4" /> Project</Button><Button variant="secondary" onClick={() => { setCompetition(emptyCompetition()); setCompetitionOpen(true) }}><Plus className="size-4" /> Competition</Button></div>} />
    {feedback && <Feedback value={feedback} />}
    <HodReviewQueue data={data} requests={queue} onDecision={setDecision} onPreview={setPreview} />
    <RequestTable data={data} requests={data.requests} title="Department request history" onPreview={setPreview} />
    <ProjectsTable data={data} userId={userId} onEdit={editProject} />
    <CompetitionsTable data={data} onEdit={editCompetition} />
    <ProjectDialog isOpen={projectOpen} project={project} setProject={setProject} data={data} facultyId="" saving={saving} onClose={() => setProjectOpen(false)} onSubmit={saveProject} />
    <CompetitionDialog isOpen={competitionOpen} competition={competition} setCompetition={setCompetition} data={data} saving={saving} onClose={() => setCompetitionOpen(false)} onSubmit={saveCompetition} />
    <DecisionDialog decision={decision} comments={comments} setComments={setComments} saving={saving} onClose={() => setDecision(null)} onSubmit={review} />
    {preview && <SecurePreview key={preview.id} attachment={preview} onClose={() => setPreview(null)} />}
  </div>
}

function StudentSummary({ items }: { items: StudentWorkflowItem[] }) {
  const active = items.filter((item) => ['submitted', 'class_teacher_approved', 'faculty_approved', 'provisional_approved', 'certificate_pending', 'certificate_verified', 'proposed', 'active'].includes(item.status)).length
  const done = items.filter((item) => ['hod_approved', 'finalized', 'completed', 'certificate_verified'].includes(item.status)).length
  return <div className="grid gap-3 sm:grid-cols-3"><Card className="p-4"><p className="text-xs font-semibold uppercase text-muted">Total</p><p className="mt-1 text-2xl font-bold text-text">{items.length}</p></Card><Card className="p-4"><p className="text-xs font-semibold uppercase text-muted">Active</p><p className="mt-1 text-2xl font-bold text-warning">{active}</p></Card><Card className="p-4"><p className="text-xs font-semibold uppercase text-muted">Completed</p><p className="mt-1 text-2xl font-bold text-success">{done}</p></Card></div>
}

function StudentWorkflowList({ data, items, onPreview, actions }: { data: RequestWorkflowData; items: StudentWorkflowItem[]; onPreview: (attachment: AttachmentRow) => void; actions: (request: RequestRow) => React.ReactNode }) {
  if (!items.length) return <EmptyState title="No matching workflows" description="Your Leave, Gate Pass, OD, Project, and Competition records will appear here." />
  return <div className="grid gap-3 lg:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold text-text">{item.title}</p><p className="mt-1 text-sm text-muted">{item.summary}</p></div><Badge tone={tone(item.status)}>{display(item.status)}</Badge></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><Meta label="Submitted" value={item.submitted} /><Meta label="Reviewer stage" value={item.stage} /><Meta label="Last update" value={item.updated} /></div><div className="mt-4"><p className="mb-2 text-xs font-semibold uppercase text-muted">Approval history</p>{item.request ? <HistorySummary data={data} requestId={item.request.id} /> : <span className="text-xs text-muted">{item.kind === 'project' ? `Guide: ${item.project?.faculty_guide_id ? profileName(data, item.project.faculty_guide_id) : 'Unassigned'}` : 'Participation record maintained by department.'}</span>}</div><div className="mt-4 flex flex-wrap items-center gap-2"><AttachmentButtons attachments={item.attachments} onPreview={onPreview} />{item.request && actions(item.request)}</div></article>)}</div>
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="font-medium text-text">{value}</p></div>
}

function RequestTable({ data, requests, title, onPreview, action }: { data: RequestWorkflowData; requests: RequestRow[]; title: string; onPreview: (attachment: AttachmentRow) => void; action?: (request: RequestRow) => React.ReactNode }) {
  return <Card><h2 className="font-bold text-text">{title}</h2><div className="mt-4"><DataTable rows={requests} empty={<EmptyState title="No requests found" />} columns={[
    { header: 'Request', render: (request) => <div><p className="font-semibold">{requestTitle(request)}</p><p className="text-xs text-muted">{display(request.request_type)} · {request.from_date ?? '—'} to {request.to_date ?? '—'}</p></div> },
    { header: 'Requester', render: (request) => profileName(data, request.requester_id) },
    { header: 'Status', render: (request) => <div><Badge tone={tone(request.status)}>{display(request.status)}</Badge>{rejectionReason(data, request.id) && <p className="mt-1 max-w-56 text-xs text-error">{rejectionReason(data, request.id)}</p>}</div> },
    { header: 'History', render: (request) => <HistorySummary data={data} requestId={request.id} /> },
    { header: 'Documents', render: (request) => <AttachmentButtons attachments={data.attachments.filter((attachment) => attachment.entity_id === request.id)} onPreview={onPreview} /> },
    ...(action ? [{ header: 'Action', render: action }] : []),
  ]} /></div></Card>
}

function FacultyReviewQueue({ data, requests, onDecision, onPreview }: { data: RequestWorkflowData; requests: RequestRow[]; onDecision: (decision: Decision) => void; onPreview: (attachment: AttachmentRow) => void }) {
  return <Card><h2 className="font-bold text-text">Faculty approval queue</h2><p className="mt-1 text-sm text-muted">Leave and gate pass actions are Class Teacher-scoped. OD actions require assigned, verified proof or certificate documents.</p><div className="mt-4"><DataTable rows={requests} empty={<EmptyState title="No requests awaiting your review" />} columns={[
    { header: 'Requester / type', render: (request) => <div><p className="font-semibold">{profileName(data, request.requester_id)}</p><p className="text-xs text-muted">{display(request.request_type)} · {requestTitle(request)}</p></div> },
    { header: 'Documents', render: (request) => <AttachmentButtons attachments={data.attachments.filter((attachment) => attachment.entity_id === request.id)} onPreview={onPreview} /> },
    { header: 'Status', render: (request) => <Badge tone={tone(request.status)}>{display(request.status)}</Badge> },
    { header: 'Decision', render: (request) => {
      const documentReady = request.request_type !== 'od' || requiredOdAttachment(data, request)?.verification_status === 'verified'
      const approveStatus: RequestStatus = request.request_type === 'od' ? request.status === 'certificate_pending' ? 'certificate_verified' : 'faculty_approved' : 'class_teacher_approved'
      const rejectStatus: RequestStatus = request.request_type === 'od' ? 'faculty_rejected' : 'rejected'
      return <div className="flex flex-wrap gap-2"><Button className="min-h-8 px-2" disabled={!documentReady} title={documentReady ? undefined : 'The assigned OD document must complete Faculty and Jury verification first.'} onClick={() => onDecision({ request, status: approveStatus })}>Approve</Button><Button className="min-h-8 px-2" variant="secondary" onClick={() => onDecision({ request, status: rejectStatus })}>Reject</Button></div>
    } },
  ]} /></div></Card>
}

function HodReviewQueue({ data, requests, onDecision, onPreview }: { data: RequestWorkflowData; requests: RequestRow[]; onDecision: (decision: Decision) => void; onPreview: (attachment: AttachmentRow) => void }) {
  return <Card><h2 className="font-bold text-text">HOD approval queue</h2><div className="mt-4"><DataTable rows={requests} empty={<EmptyState title="No requests awaiting HOD action" />} columns={[
    { header: 'Request', render: (request) => <div><p className="font-semibold">{requestTitle(request)}</p><p className="text-xs text-muted">{profileName(data, request.requester_id)} · {display(request.request_type)}</p></div> },
    { header: 'Current status', render: (request) => <Badge tone={tone(request.status)}>{display(request.status)}</Badge> },
    { header: 'Documents', render: (request) => <AttachmentButtons attachments={data.attachments.filter((attachment) => attachment.entity_id === request.id)} onPreview={onPreview} /> },
    { header: 'Decision', render: (request) => {
      const approveStatus: RequestStatus = request.request_type === 'od' ? request.status === 'certificate_verified' ? 'finalized' : 'provisional_approved' : 'hod_approved'
      return <div className="flex flex-wrap gap-2"><Button className="min-h-8 px-2" onClick={() => onDecision({ request, status: approveStatus })}>{approveStatus === 'finalized' ? 'Finalize' : 'Approve'}</Button>{approveStatus !== 'finalized' && <Button className="min-h-8 px-2" variant="secondary" onClick={() => onDecision({ request, status: 'hod_rejected' })}>Reject</Button>}</div>
    } },
  ]} /></div></Card>
}

function ProjectsTable({ data, userId, onEdit }: { data: RequestWorkflowData; userId: string; onEdit?: (project: ProjectRow) => void }) {
  return <Card><h2 className="font-bold text-text">Projects and Faculty Guides</h2><div className="mt-4"><DataTable rows={data.projects} empty={<EmptyState title="No visible projects" />} columns={[
    { header: 'Project', render: (project) => <div><p className="font-semibold">{project.name}</p><p className="max-w-sm text-xs text-muted">{project.description}</p></div> },
    { header: 'Faculty Guide', render: (project) => project.faculty_guide_id ? profileName(data, project.faculty_guide_id) : 'Unassigned' },
    { header: 'Members', render: (project) => {
      const members = data.projectMembers.filter((member) => member.project_id === project.id)
      return <span className="text-xs">{members.map((member) => profileName(data, member.student_id)).join(', ') || 'No visible members'}</span>
    } },
    { header: 'Status', render: (project) => <Badge tone={tone(project.status)}>{display(project.status)}</Badge> },
    ...(onEdit ? [{ header: 'Action', render: (project: ProjectRow) => project.faculty_guide_id === userId || onEdit ? <Button className="min-h-8 px-2" variant="secondary" onClick={() => onEdit(project)}><Pencil className="size-4" /> Edit</Button> : null }] : []),
  ]} /></div></Card>
}

function CompetitionsTable({ data, onEdit }: { data: RequestWorkflowData; onEdit?: (competition: CompetitionRow) => void }) {
  return <Card><h2 className="font-bold text-text">Competition participation</h2><div className="mt-4"><DataTable rows={data.competitions} empty={<EmptyState title="No competition records" />} columns={[
    { header: 'Competition', render: (competition) => <div><p className="font-semibold">{competition.name}</p><p className="text-xs text-muted">{textDetail(competition.details, 'competition_type') || 'competition'} · {textDetail(competition.details, 'level') || 'level not set'}</p></div> },
    { header: 'Organizer / venue', render: (competition) => `${competition.organizer} · ${competition.venue ?? '—'}` },
    { header: 'Dates', render: (competition) => `${competition.event_date}${textDetail(competition.details, 'end_date') ? ` to ${textDetail(competition.details, 'end_date')}` : ''}` },
    { header: 'Participants', render: (competition) => jsonStringArray(competition.details, 'participant_ids').length },
    ...(onEdit ? [{ header: 'Action', render: (competition: CompetitionRow) => <Button className="min-h-8 px-2" variant="secondary" onClick={() => onEdit(competition)}><Pencil className="size-4" /> Edit</Button> }] : []),
  ]} /></div></Card>
}

function RequestDialog({ isOpen, form, setForm, file, setFile, saving, staffOnly = false, projects, competitions, onClose, onSubmit }: { isOpen: boolean; form: RequestFormState; setForm: (form: RequestFormState) => void; file: File | null; setFile: (file: File | null) => void; saving: boolean; staffOnly?: boolean; projects: ProjectRow[]; competitions: CompetitionRow[]; onClose: () => void; onSubmit: () => Promise<void> }) {
  const type = staffOnly ? 'staff_leave' : form.requestType
  const [fileError, setFileError] = useState('')
  return <Modal isOpen={isOpen} title={staffOnly ? 'Submit staff leave' : 'Submit request'} onClose={onClose}><div className="space-y-4">
    {!staffOnly && <label className="block text-sm font-semibold">Request type<Select className="mt-1" value={form.requestType} onChange={(event) => { setForm(emptyRequest(event.target.value as RequestType)); setFile(null); setFileError('') }}>{studentTypes.map((value) => <option key={value} value={value}>{display(value)}</option>)}</Select></label>}
    {(type === 'student_leave' || type === 'staff_leave') && <label className="block text-sm font-semibold">Leave type<Select className="mt-1" value={form.leaveType} onChange={(event) => setForm({ ...form, leaveType: event.target.value })}><option value="">Select leave type</option><option value="casual">Casual</option><option value="medical">Medical</option><option value="duty">Duty</option><option value="other">Other</option></Select></label>}
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">{type === 'gate_pass' ? 'Pass date' : 'From date'}<Input className="mt-1" type="date" value={form.fromDate} onChange={(event) => setForm({ ...form, fromDate: event.target.value, toDate: type === 'gate_pass' ? event.target.value : form.toDate })} /></label>{type !== 'gate_pass' && <label className="text-sm font-semibold">To date<Input className="mt-1" type="date" value={form.toDate} onChange={(event) => setForm({ ...form, toDate: event.target.value })} /></label>}</div>
    {type === 'gate_pass' && <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold sm:col-span-2">Destination<Input className="mt-1" value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} /></label><label className="text-sm font-semibold">Exit time<Input className="mt-1" type="time" value={form.exitTime} onChange={(event) => setForm({ ...form, exitTime: event.target.value })} /></label><label className="text-sm font-semibold">Expected return<Input className="mt-1" type="time" value={form.returnTime} onChange={(event) => setForm({ ...form, returnTime: event.target.value })} /></label></div>}
    {type === 'od' && <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold sm:col-span-2">Event name<Input className="mt-1" value={form.eventName} onChange={(event) => setForm({ ...form, eventName: event.target.value })} /></label><label className="text-sm font-semibold">Organizer<Input className="mt-1" value={form.organizer} onChange={(event) => setForm({ ...form, organizer: event.target.value })} /></label><label className="text-sm font-semibold">Venue<Input className="mt-1" value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></label><label className="text-sm font-semibold">Event date<Input className="mt-1" type="date" value={form.eventDate} onChange={(event) => setForm({ ...form, eventDate: event.target.value })} /></label><label className="text-sm font-semibold">Linked project<Select className="mt-1" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></label><label className="text-sm font-semibold sm:col-span-2">Linked competition<Select className="mt-1" value={form.competitionId} onChange={(event) => setForm({ ...form, competitionId: event.target.value })}><option value="">None</option>{competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}</Select></label></div>}
    <label className="block text-sm font-semibold">Reason<Textarea className="mt-1" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
    <PrivateFileInput label={type === 'od' ? 'OD proof' : 'Optional supporting document'} file={file} onFile={setFile} onError={setFileError} disabled={saving} />
    {fileError && <p role="alert" className="text-sm text-error">{fileError}</p>}
    <div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || Boolean(fileError) || (type === 'od' && !file)} onClick={() => void onSubmit()}>{saving ? 'Submitting…' : 'Submit request'}</Button></div>
  </div></Modal>
}

function ProjectDialog({ isOpen, project, setProject, data, facultyId, saving, onClose, onSubmit }: { isOpen: boolean; project: ProjectInput; setProject: (project: ProjectInput) => void; data: RequestWorkflowData; facultyId: string; saving: boolean; onClose: () => void; onSubmit: () => Promise<void> }) {
  const activeStudentIds = new Set(data.enrollments.filter((row) => row.status === 'active').map((row) => row.student_id))
  const students = data.profiles.filter((row) => row.role === 'student' && row.status === 'active' && activeStudentIds.has(row.id))
  const guideIds = new Set(data.assignments.filter((row) => row.is_active && row.assignment_type === 'faculty_guide').map((row) => row.faculty_id))
  const guides = data.profiles.filter((row) => row.role === 'faculty' && row.status === 'active' && guideIds.has(row.id))
  const toggle = (id: string) => setProject({ ...project, memberIds: project.memberIds.includes(id) ? project.memberIds.filter((value) => value !== id) : [...project.memberIds, id] })
  return <Modal isOpen={isOpen} title={project.id ? 'Edit project' : 'Create project'} onClose={onClose}><div className="space-y-4"><label className="block text-sm font-semibold">Project name<Input className="mt-1" value={project.name} onChange={(event) => setProject({ ...project, name: event.target.value })} /></label><label className="block text-sm font-semibold">Description<Textarea className="mt-1" value={project.description} onChange={(event) => setProject({ ...project, description: event.target.value })} /></label>{!facultyId && <label className="block text-sm font-semibold">Faculty Guide<Select className="mt-1" value={project.facultyGuideId} onChange={(event) => setProject({ ...project, facultyGuideId: event.target.value })}><option value="">Select active Faculty Guide</option>{guides.map((guide) => <option key={guide.id} value={guide.id}>{guide.full_name}</option>)}</Select></label>}<label className="block text-sm font-semibold">Status<Select className="mt-1" value={project.status} onChange={(event) => setProject({ ...project, status: event.target.value })}>{projectStatuses.map((status) => <option key={status}>{status}</option>)}</Select></label><div><p className="text-sm font-semibold">Active enrolled members</p><div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3">{students.map((student) => <label key={student.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={project.memberIds.includes(student.id)} onChange={() => toggle(student.id)} /> {student.full_name} · {student.employee_or_register_number ?? '—'}</label>)}{!students.length && <p className="text-sm text-muted">No authorized active students are visible.</p>}</div></div><div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void onSubmit()}>{saving ? 'Saving…' : 'Save project'}</Button></div></div></Modal>
}

function CompetitionDialog({ isOpen, competition, setCompetition, data, saving, onClose, onSubmit }: { isOpen: boolean; competition: CompetitionInput; setCompetition: (competition: CompetitionInput) => void; data: RequestWorkflowData; saving: boolean; onClose: () => void; onSubmit: () => Promise<void> }) {
  const details = jsonObject(competition.details)
  const participants = jsonStringArray(competition.details, 'participant_ids')
  const activeStudentIds = new Set(data.enrollments.filter((row) => row.status === 'active').map((row) => row.student_id))
  const students = data.profiles.filter((row) => row.role === 'student' && row.status === 'active' && activeStudentIds.has(row.id))
  const changeDetail = (key: string, value: Json) => setCompetition({ ...competition, details: { ...details, [key]: value } })
  const toggle = (id: string) => changeDetail('participant_ids', participants.includes(id) ? participants.filter((value) => value !== id) : [...participants, id])
  return <Modal isOpen={isOpen} title={competition.id ? 'Edit competition record' : 'Create competition record'} onClose={onClose}><div className="space-y-4"><label className="block text-sm font-semibold">Competition name<Input className="mt-1" value={competition.name} onChange={(event) => setCompetition({ ...competition, name: event.target.value })} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Type<Select className="mt-1" value={textDetail(competition.details, 'competition_type')} onChange={(event) => changeDetail('competition_type', event.target.value)}>{competitionTypes.map((value) => <option key={value}>{value}</option>)}</Select></label><label className="text-sm font-semibold">Level<Select className="mt-1" value={textDetail(competition.details, 'level')} onChange={(event) => changeDetail('level', event.target.value)}>{competitionLevels.map((value) => <option key={value}>{value}</option>)}</Select></label><label className="text-sm font-semibold">Organizer<Input className="mt-1" value={competition.organizer} onChange={(event) => setCompetition({ ...competition, organizer: event.target.value })} /></label><label className="text-sm font-semibold">Venue<Input className="mt-1" value={competition.venue} onChange={(event) => setCompetition({ ...competition, venue: event.target.value })} /></label><label className="text-sm font-semibold">Start date<Input className="mt-1" type="date" value={competition.eventDate} onChange={(event) => setCompetition({ ...competition, eventDate: event.target.value })} /></label><label className="text-sm font-semibold">End date<Input className="mt-1" type="date" value={textDetail(competition.details, 'end_date')} onChange={(event) => changeDetail('end_date', event.target.value)} /></label></div><div><p className="text-sm font-semibold">Participants</p><div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border p-3">{students.map((student) => <label key={student.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={participants.includes(student.id)} onChange={() => toggle(student.id)} /> {student.full_name}</label>)}</div></div><div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void onSubmit()}>{saving ? 'Saving…' : 'Save competition'}</Button></div></div></Modal>
}

function DecisionDialog({ decision, comments, setComments, saving, onClose, onSubmit }: { decision: Decision | null; comments: string; setComments: (comments: string) => void; saving: boolean; onClose: () => void; onSubmit: () => Promise<void> }) {
  return <ConfirmDialog isOpen={Boolean(decision)} title="Confirm workflow decision" description={`Move this request to ${decision ? display(decision.status) : ''}? The secured transition RPC records the actor and history.`} confirmLabel={saving ? 'Saving…' : 'Confirm decision'} onCancel={onClose} onConfirm={() => void onSubmit()}><label className="mt-4 block text-sm font-semibold">Comments{decision && ['rejected', 'faculty_rejected', 'hod_rejected'].includes(decision.status) ? ' / rejection reason' : ''}<Textarea className="mt-1" value={comments} onChange={(event) => setComments(event.target.value)} /></label></ConfirmDialog>
}

function CertificateDialog({ request, file, setFile, saving, onClose, onSubmit }: { request: RequestRow | null; file: File | null; setFile: (file: File | null) => void; saving: boolean; onClose: () => void; onSubmit: () => Promise<void> }) {
  const [fileError, setFileError] = useState('')
  return <Modal isOpen={Boolean(request)} title="Upload OD certificate" onClose={onClose}><p className="text-sm text-muted">The certificate will enter assigned Faculty and Jury review before request finalization.</p><div className="mt-4"><PrivateFileInput label="OD certificate" file={file} onFile={setFile} onError={setFileError} disabled={saving} /></div>{fileError && <p role="alert" className="mt-2 text-sm text-error">{fileError}</p>}<div className="mt-5 flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || !file || Boolean(fileError)} onClick={() => void onSubmit()}><Upload className="size-4" /> {saving ? 'Uploading…' : 'Upload certificate'}</Button></div></Modal>
}

function GatePassDialog({ request, onClose }: { request: RequestRow | null; onClose: () => void }) {
  const details = request ? jsonObject(request.details) : {}
  return <Modal isOpen={Boolean(request)} title="Approved gate pass" onClose={onClose}>{request && <div className="space-y-3"><p className="text-sm text-muted">AI&amp;DS Department · Gate Pass</p><h2 className="text-xl font-bold">{request.reason}</h2><p><strong>Date:</strong> {request.from_date}</p><p><strong>Destination:</strong> {String(details.destination ?? '—')}</p><p><strong>Exit:</strong> {String(details.exit_time ?? '—')} · <strong>Return:</strong> {String(details.return_time ?? '—')}</p><Badge tone="success">HOD approved</Badge><Button className="mt-3" onClick={() => window.print()}><Printer className="size-4" /> Print pass</Button></div>}</Modal>
}

function StudentRequestActions({ request, data, setPass, setCertificateRequest, setPreview }: { request: RequestRow; data: RequestWorkflowData; setPass: (request: RequestRow) => void; setCertificateRequest: (request: RequestRow) => void; setPreview: (attachment: AttachmentRow) => void }) {
  const certificate = data.attachments.find((attachment) => attachment.entity_id === request.id && attachment.bucket_id === PRIVATE_FILE_BUCKET.odCertificate && attachment.is_active)
  return <div className="flex flex-wrap gap-2">{request.request_type === 'gate_pass' && request.status === 'hod_approved' && <Button className="min-h-8 px-2" variant="secondary" onClick={() => setPass(request)}><FileCheck2 className="size-4" /> Pass</Button>}{request.request_type === 'od' && request.status === 'provisional_approved' && <Button className="min-h-8 px-2" onClick={() => setCertificateRequest(request)}><Upload className="size-4" /> Certificate</Button>}{certificate && <Button className="min-h-8 px-2" variant="secondary" onClick={() => setPreview(certificate)}><Eye className="size-4" /> Certificate</Button>}</div>
}

function AttachmentButtons({ attachments, onPreview }: { attachments: AttachmentRow[]; onPreview: (attachment: AttachmentRow) => void }) {
  return <div className="flex flex-wrap gap-2">{attachments.filter((attachment) => attachment.is_active).map((attachment) => <Button key={attachment.id} className="min-h-8 px-2" variant="secondary" onClick={() => onPreview(attachment)}><Eye className="size-3" /> {attachment.bucket_id === PRIVATE_FILE_BUCKET.odProof ? 'Proof' : attachment.bucket_id === PRIVATE_FILE_BUCKET.odCertificate ? 'Certificate' : 'Document'} <Badge tone={tone(attachment.verification_status)}>{display(attachment.verification_status)}</Badge></Button>)}{!attachments.length && <span className="text-muted">—</span>}</div>
}

function HistorySummary({ data, requestId }: { data: RequestWorkflowData; requestId: string }) {
  const history = data.history.filter((row) => row.request_id === requestId).sort((a, b) => a.created_at.localeCompare(b.created_at))
  return <span className="block max-w-72 text-xs text-muted">{history.map((row) => `${row.new_status ? display(row.new_status) : row.action} · ${row.actor_id ? profileName(data, row.actor_id) : 'System'}`).join(' → ') || 'No history available'}</span>
}

function requiredOdAttachment(data: RequestWorkflowData, request: RequestRow) {
  const bucket = request.status === 'certificate_pending' ? PRIVATE_FILE_BUCKET.odCertificate : PRIVATE_FILE_BUCKET.odProof
  return data.attachments.find((attachment) => attachment.entity_id === request.id && attachment.bucket_id === bucket && attachment.is_active)
}

function rejectionReason(data: RequestWorkflowData, requestId: string) {
  return data.history.filter((row) => row.request_id === requestId && row.comments).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.comments ?? ''
}

function studentWorkflowItems(data: RequestWorkflowData, requests: RequestRow[], projects: ProjectRow[], competitions: CompetitionRow[]): StudentWorkflowItem[] {
  const requestItems: StudentWorkflowItem[] = requests.map((request) => ({
    id: request.id,
    kind: request.request_type === 'student_leave' ? 'student_leave' : request.request_type === 'gate_pass' ? 'gate_pass' : 'od',
    title: requestTitle(request),
    summary: `${display(request.request_type)} - ${request.from_date ?? '-'} to ${request.to_date ?? '-'}`,
    status: request.status,
    submitted: dateText(request.created_at),
    updated: dateText(request.updated_at),
    stage: reviewerStage(request),
    request,
    attachments: data.attachments.filter((attachment) => attachment.entity_id === request.id && attachment.is_active),
  }))
  const projectItems: StudentWorkflowItem[] = projects.map((project) => ({
    id: project.id,
    kind: 'project',
    title: project.name,
    summary: project.description,
    status: project.status,
    submitted: dateText(project.created_at),
    updated: dateText(project.updated_at),
    stage: project.faculty_guide_id ? `Faculty Guide - ${profileName(data, project.faculty_guide_id)}` : 'Faculty Guide pending',
    project,
    attachments: [],
  }))
  const competitionItems: StudentWorkflowItem[] = competitions.map((competition) => ({
    id: competition.id,
    kind: 'competition',
    title: competition.name,
    summary: `${competition.organizer} - ${competition.venue ?? 'Venue pending'} - ${competition.event_date}`,
    status: textDetail(competition.details, 'level') || 'registered',
    submitted: dateText(competition.created_at),
    updated: dateText(competition.updated_at),
    stage: 'Department maintained',
    competition,
    attachments: [],
  }))
  return [...requestItems, ...projectItems, ...competitionItems].sort((a, b) => b.updated.localeCompare(a.updated))
}

function reviewerStage(request: RequestRow) {
  if (request.status === 'submitted') return request.request_type === 'od' ? 'Faculty document review' : 'Class Teacher review'
  if (request.status === 'class_teacher_approved' || request.status === 'faculty_approved' || request.status === 'certificate_verified') return 'HOD review'
  if (request.status === 'provisional_approved') return 'Student certificate upload'
  if (request.status === 'certificate_pending') return 'Certificate verification'
  if (['hod_approved', 'finalized'].includes(request.status)) return 'Completed'
  if (['rejected', 'faculty_rejected', 'hod_rejected'].includes(request.status)) return 'Rejected'
  return display(request.status)
}

function dateText(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : '-'
}

function requestTitle(request: RequestRow) {
  const details = jsonObject(request.details)
  if (request.request_type === 'od') return String(details.event_name ?? 'OD request')
  if (request.request_type === 'gate_pass') return String(details.destination ?? 'Gate pass')
  return `${display(String(details.leave_type ?? 'leave'))}: ${request.reason}`
}

function requestDetails(form: RequestFormState): Json {
  if (form.requestType === 'student_leave' || form.requestType === 'staff_leave') return { leave_type: form.leaveType }
  if (form.requestType === 'gate_pass') return { destination: form.destination.trim(), exit_time: form.exitTime, return_time: form.returnTime }
  return { event_name: form.eventName.trim(), organizer: form.organizer.trim(), venue: form.venue.trim(), event_date: form.eventDate, project_id: form.projectId || null, competition_id: form.competitionId || null }
}

function emptyRequest(requestType: RequestType): RequestFormState {
  return { requestType, reason: '', fromDate: '', toDate: '', leaveType: '', destination: '', exitTime: '', returnTime: '', eventName: '', organizer: '', venue: '', eventDate: today(), projectId: '', competitionId: '' }
}

function emptyProject(facultyGuideId: string): ProjectInput {
  return { name: '', description: '', facultyGuideId, status: 'proposed', memberIds: [] }
}

function emptyCompetition(): CompetitionInput {
  return { name: '', organizer: '', venue: '', eventDate: today(), details: { competition_type: 'hackathon', level: 'college', end_date: today(), participant_ids: [] } }
}

function jsonObject(value: Json): Record<string, Json | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

function textDetail(value: Json, key: string) {
  const detail = jsonObject(value)[key]
  return typeof detail === 'string' ? detail : ''
}

function jsonStringArray(value: Json, key: string): string[] {
  const detail = jsonObject(value)[key]
  return Array.isArray(detail) ? detail.filter((item): item is string => typeof item === 'string') : []
}

function profileName(data: RequestWorkflowData, id: string) {
  return data.profiles.find((profile) => profile.id === id)?.full_name ?? 'Profile restricted by RLS'
}

function Feedback({ value }: { value: FeedbackValue }) {
  return <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${value.error ? 'border-error/30 bg-error/5 text-error' : 'border-success/30 bg-success/5 text-success'}`}>{value.message}</p>
}

interface ViewProps {
  data: RequestWorkflowData
  reload: () => Promise<void>
  userId: string
}

interface Decision {
  request: RequestRow
  status: RequestStatus
}
