import { Eye, RefreshCw, Search } from 'lucide-react'
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
import { SecureAttachmentPreview } from '@/modules/document-reviews/SecureAttachmentPreview'
import { PRIVATE_FILE_BUCKET } from '@/services/supabase/privateFileRepository'
import { requestWorkflowRepository, type AttachmentRow, type RequestRow, type RequestWorkflowData } from '@/services/supabase/requestWorkflowRepository'
import type { Json } from '@/types/database.types'

type RequestTypeFilter = 'all' | 'student_leave' | 'staff_leave' | 'gate_pass' | 'od'

const studyYears = [1, 2, 3, 4]
const requestTypes: RequestTypeFilter[] = ['all', 'student_leave', 'staff_leave', 'gate_pass', 'od']
const display = (value: string) => value.replaceAll('_', ' ')
const tone = (status: string): 'primary' | 'success' | 'warning' | 'muted' => ['hod_approved', 'finalized', 'certificate_verified', 'verified', 'completed', 'active'].includes(status) ? 'success' : ['submitted', 'class_teacher_approved', 'faculty_approved', 'provisional_approved', 'certificate_pending', 'pending_faculty_review', 'pending_jury_review', 'proposed'].includes(status) ? 'warning' : ['faculty_rejected', 'hod_rejected', 'rejected', 'cancelled', 'archived'].includes(status) ? 'muted' : 'primary'
const textDetail = (value: Json, key: string) => {
  const detail = jsonObject(value)[key]
  return typeof detail === 'string' ? detail : ''
}
const jsonObject = (value: Json): Record<string, Json | undefined> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
const jsonStringArray = (value: Json, key: string): string[] => {
  const detail = jsonObject(value)[key]
  return Array.isArray(detail) ? detail.filter((item): item is string => typeof item === 'string') : []
}

export function AdminRequestsPage() {
  const { currentUser } = useAuth()
  const resource = useAsyncResource(useCallback(() => requestWorkflowRepository.loadData(), []))
  const [requestType, setRequestType] = useState<RequestTypeFilter>('all')
  const [status, setStatus] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [studyYear, setStudyYear] = useState('all')
  const [sectionId, setSectionId] = useState('all')
  const [personId, setPersonId] = useState('all')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<AttachmentRow | null>(null)

  if (!currentUser || currentUser.role !== USER_ROLES.superAdmin) return <ErrorState title="Super Admin access required" description="Admin Requests is available only to the Super Admin." />
  if (resource.isLoading) return <LoadingState label="Loading Admin Requests..." />
  if (resource.error) return <div className="space-y-4"><ErrorState title="Unable to load Admin Requests" description={resource.error} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>
  const data = resource.data
  if (!data) return null

  const aiDepartment = findAiDsDepartment(data.departments)
  if (!aiDepartment) return <ErrorState title="Department unavailable" description="Create a department before viewing Admin Requests." />
  const aiSections = data.sections.filter((section) => section.department_id === aiDepartment.id)
  const requesters = data.profiles.filter((profile) => data.requests.some((request) => request.requester_id === profile.id))
  const statuses = Array.from(new Set(data.requests.map((request) => request.status))).sort()
  const filteredRequests = data.requests.filter((request) => {
    const profile = data.profiles.find((item) => item.id === request.requester_id)
    const requesterSection = sectionForRequester(data, request)
    const haystack = [profile?.full_name, profile?.employee_or_register_number, request.reason, request.request_type, request.status, requestTitle(data, request), relationshipSummary(data, request)].join(' ').toLowerCase()
    return (requestType === 'all' || request.request_type === requestType)
      && (status === 'all' || request.status === status)
      && (!dateFrom || (request.from_date ?? request.created_at.slice(0, 10)) >= dateFrom)
      && (!dateTo || (request.to_date ?? request.created_at.slice(0, 10)) <= dateTo)
      && (studyYear === 'all' || requesterSection?.year_number === Number(studyYear))
      && (sectionId === 'all' || requesterSection?.id === sectionId)
      && (personId === 'all' || request.requester_id === personId)
      && (!search || haystack.includes(search.toLowerCase()))
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))

  return <div className="space-y-6">
    <PageHeader title="Admin Requests and OD" description="Read-only Super Admin monitoring for leave, gate pass, projects, competitions, OD proofs, and certificates." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>} />
    <Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Select value={requestType} onChange={(event) => setRequestType(event.target.value as RequestTypeFilter)}>{requestTypes.map((type) => <option key={type} value={type}>{type === 'all' ? 'All request types' : display(type)}</option>)}</Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{display(item)}</option>)}</Select>
        <Input aria-label="From date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input aria-label="To date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        <Select value={studyYear} onChange={(event) => { setStudyYear(event.target.value); setSectionId('all') }}><option value="all">All Study Years</option>{studyYears.map((year) => <option key={year} value={year}>Year {year}</option>)}</Select>
        <Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="all">All Sections</option>{aiSections.filter((section) => studyYear === 'all' || section.year_number === Number(studyYear)).map((section) => <option key={section.id} value={section.id}>{section.name}{section.batch ? ` - ${section.batch}` : ''}</option>)}</Select>
        <Select value={personId} onChange={(event) => setPersonId(event.target.value)}><option value="all">All Students/Staff</option>{requesters.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name} - {profile.employee_or_register_number ?? profile.role}</option>)}</Select>
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input className="pl-9" placeholder="Search reason, person, event" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      {dateFrom && dateTo && dateTo < dateFrom && <p className="mt-3 text-sm text-error">Date range end cannot be before start.</p>}
    </Card>

    <div className="grid gap-4 sm:grid-cols-4">
      <Metric label="Requests" value={filteredRequests.length.toString()} />
      <Metric label="Pending" value={filteredRequests.filter((request) => ['submitted', 'class_teacher_approved', 'faculty_approved', 'provisional_approved', 'certificate_pending', 'certificate_verified'].includes(request.status)).length.toString()} />
      <Metric label="OD Requests" value={filteredRequests.filter((request) => request.request_type === 'od').length.toString()} />
      <Metric label="Secure Files" value={data.attachments.filter((attachment) => attachment.is_active && filteredRequests.some((request) => request.id === attachment.entity_id)).length.toString()} />
    </div>

    <Card>
      <h2 className="font-bold text-text">Request Monitoring</h2>
      <div className="mt-4"><DataTable rows={filteredRequests} empty={<EmptyState title="No requests match the filters" />} columns={[
        { header: 'Requester', render: (request) => requesterLabel(data, request) },
        { header: 'Type / dates', render: (request) => <div><p className="font-semibold">{display(request.request_type)}</p><p className="text-xs text-muted">{request.from_date ?? '—'} to {request.to_date ?? '—'}</p></div> },
        { header: 'Reason', render: (request) => <div className="max-w-xs whitespace-normal"><p>{request.reason}</p><p className="text-xs text-muted">{requestTitle(data, request)}</p></div> },
        { header: 'Approval status', render: (request) => <Badge tone={tone(request.status)}>{display(request.status)}</Badge> },
        { header: 'History', render: (request) => <History data={data} request={request} /> },
        { header: 'Relationships', render: (request) => <span className="block max-w-xs whitespace-normal text-xs text-muted">{relationshipSummary(data, request)}</span> },
        { header: 'Proofs / certificates', render: (request) => <AttachmentButtons attachments={data.attachments.filter((attachment) => attachment.entity_id === request.id && attachment.is_active)} onPreview={setPreview} /> },
      ]} /></div>
    </Card>

    <ProjectMonitor data={data} />
    <CompetitionMonitor data={data} />
    {preview && <SecureAttachmentPreview key={preview.id} attachment={preview} onClose={() => setPreview(null)} />}
  </div>
}

function requesterLabel(data: RequestWorkflowData, request: RequestRow) {
  const profile = data.profiles.find((item) => item.id === request.requester_id)
  if (!profile) return 'Profile unavailable'
  return <div><p className="font-semibold">{profile.full_name}</p><p className="text-xs text-muted">{profile.employee_or_register_number ?? display(profile.role)}</p></div>
}

function sectionForRequester(data: RequestWorkflowData, request: RequestRow) {
  const enrollment = data.enrollments.find((item) => item.student_id === request.requester_id && item.status === 'active')
  return data.sections.find((section) => section.id === enrollment?.section_id)
}

function requestTitle(data: RequestWorkflowData, request: RequestRow) {
  const details = jsonObject(request.details)
  if (request.request_type === 'od') return String(details.event_name ?? 'OD request')
  if (request.request_type === 'gate_pass') return String(details.destination ?? 'Gate pass')
  const leaveType = String(details.leave_type ?? (request.request_type === 'staff_leave' ? 'staff leave' : 'student leave'))
  const section = sectionForRequester(data, request)
  return `${display(leaveType)}${section ? ` - Year ${section.year_number} ${section.name}` : ''}`
}

function relationshipSummary(data: RequestWorkflowData, request: RequestRow) {
  if (request.request_type !== 'od') return request.request_type === 'gate_pass' ? 'Gate Pass request' : 'Leave workflow'
  const details = jsonObject(request.details)
  const project = data.projects.find((item) => item.id === details.project_id)
  const competition = data.competitions.find((item) => item.id === details.competition_id)
  return [`Event: ${String(details.event_name ?? 'OD event')}`, project ? `Project: ${project.name}` : '', competition ? `Competition: ${competition.name}` : '', details.organizer ? `Organizer: ${String(details.organizer)}` : '', details.venue ? `Venue: ${String(details.venue)}` : ''].filter(Boolean).join(' | ')
}

function History({ data, request }: { data: RequestWorkflowData; request: RequestRow }) {
  const rows = data.history.filter((history) => history.request_id === request.id).sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (!rows.length) return <span className="text-xs text-muted">No history</span>
  return <span className="block max-w-80 whitespace-normal text-xs text-muted">{rows.map((row) => `${row.actor_role ? display(row.actor_role) : 'System'}: ${row.new_status ? display(row.new_status) : display(row.action)}${row.comments ? ` (${row.comments})` : ''}`).join(' -> ')}</span>
}

function AttachmentButtons({ attachments, onPreview }: { attachments: AttachmentRow[]; onPreview: (attachment: AttachmentRow) => void }) {
  if (!attachments.length) return <span className="text-muted">—</span>
  return <div className="flex flex-wrap gap-2">{attachments.map((attachment) => <Button key={attachment.id} className="min-h-8 px-2" variant="secondary" onClick={() => onPreview(attachment)}><Eye className="size-3" /> {attachment.bucket_id === PRIVATE_FILE_BUCKET.odProof ? 'Proof' : attachment.bucket_id === PRIVATE_FILE_BUCKET.odCertificate ? 'Certificate' : 'Document'} <Badge tone={tone(attachment.verification_status)}>{display(attachment.verification_status)}</Badge></Button>)}</div>
}

function ProjectMonitor({ data }: { data: RequestWorkflowData }) {
  return <Card><h2 className="font-bold text-text">Projects</h2><div className="mt-4"><DataTable rows={data.projects} empty={<EmptyState title="No projects available" />} columns={[
    { header: 'Project', render: (project) => <div><p className="font-semibold">{project.name}</p><p className="max-w-xs whitespace-normal text-xs text-muted">{project.description}</p></div> },
    { header: 'Faculty Guide', render: (project) => profileText(data, project.faculty_guide_id) },
    { header: 'Members', render: (project) => data.projectMembers.filter((member) => member.project_id === project.id).map((member) => profileText(data, member.student_id)).join(', ') || '—' },
    { header: 'Status', render: (project) => <Badge tone={tone(project.status)}>{display(project.status)}</Badge> },
  ]} /></div></Card>
}

function CompetitionMonitor({ data }: { data: RequestWorkflowData }) {
  return <Card><h2 className="font-bold text-text">Competitions</h2><div className="mt-4"><DataTable rows={data.competitions} empty={<EmptyState title="No competitions available" />} columns={[
    { header: 'Competition', render: (competition) => <div><p className="font-semibold">{competition.name}</p><p className="text-xs text-muted">{competition.organizer} - {competition.venue ?? 'Venue unavailable'}</p></div> },
    { header: 'Date', render: (competition) => `${competition.event_date}${textDetail(competition.details, 'end_date') ? ` to ${textDetail(competition.details, 'end_date')}` : ''}` },
    { header: 'Type / level', render: (competition) => `${display(textDetail(competition.details, 'competition_type') || 'competition')} - ${display(textDetail(competition.details, 'level') || 'level unavailable')}` },
    { header: 'Participants', render: (competition) => jsonStringArray(competition.details, 'participant_ids').map((id) => profileText(data, id)).join(', ') || '—' },
  ]} /></div></Card>
}

function profileText(data: RequestWorkflowData, id: string | null) {
  if (!id) return '—'
  const profile = data.profiles.find((item) => item.id === id)
  if (!profile) return 'Profile unavailable'
  return `${profile.full_name}${profile.employee_or_register_number ? ` - ${profile.employee_or_register_number}` : ''}`
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-text">{value}</p></Card>
}
