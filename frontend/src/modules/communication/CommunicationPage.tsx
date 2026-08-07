import { Bell, CalendarClock, Mail, Paperclip, Plus, Search } from 'lucide-react'
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
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { USER_ROLES } from '@/constants/roles'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { PrivateFileInput } from '@/modules/document-reviews/PrivateFileInput'
import { SecureAttachmentPreview } from '@/modules/document-reviews/SecureAttachmentPreview'
import { departmentOperationsRepository, type AnnouncementRecord, type ComplaintRecord, type FloorDutyRecord, type MessageRecord } from '@/services/supabase/departmentOperationsRepository'
import type { AttachmentRow } from '@/services/supabase/privateFileRepository'

/** Which panels a route wants. Students get one panel per page; staff keep the combined view. */
export type CommunicationSection = 'announcements' | 'complaints' | 'messages'
const allSections: CommunicationSection[] = ['announcements', 'complaints', 'messages']
const headings: Record<CommunicationSection, { title: string; description: string; search: string }> = {
  announcements: { title: 'Announcements', description: 'Announcements published to you. You only see the ones addressed to you.', search: 'Search announcements' },
  complaints: { title: 'Complaints', description: 'Raise a complaint and track how it is handled. Resolved complaints are locked.', search: 'Search complaints' },
  messages: { title: 'Messages', description: 'Direct messages with active department users.', search: 'Search messages' },
}

const audiences = ['department', 'faculty', 'students', 'lab_assistants', 'section', 'assigned_students'] as const
const tone = (value: string): 'primary' | 'success' | 'warning' | 'muted' => value === 'resolved' || value === 'read' ? 'success' : value === 'submitted' || value === 'in_review' || value === 'high' || value === 'unread' ? 'warning' : 'primary'
const initialAnnouncement = () => ({ id: '', title: '', message: '', category: 'Academic', priority: 'normal' as 'low' | 'normal' | 'high', audience: 'department', targetId: '', publishDate: new Date().toISOString().slice(0, 10), expiryDate: '', file: null as File | null })
const initialComplaint = () => ({ category: 'Infrastructure', subject: '', description: '', file: null as File | null })

export function CommunicationPage({ sections = allSections }: { sections?: CommunicationSection[] } = {}) {
  const { currentUser } = useAuth()
  const load = useCallback(() => departmentOperationsRepository.load(), [])
  const resource = useAsyncResource(load)
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [complaintOpen, setComplaintOpen] = useState(false)
  const [messageOpen, setMessageOpen] = useState(false)
  const [reviewing, setReviewing] = useState<ComplaintRecord | null>(null)
  const [preview, setPreview] = useState<AttachmentRow | null>(null)
  const [announcement, setAnnouncement] = useState(initialAnnouncement)
  const [complaint, setComplaint] = useState(initialComplaint)
  const [message, setMessage] = useState({ recipientId: '', body: '' })
  const [review, setReview] = useState({ status: 'in_review' as 'in_review' | 'resolved', response: '', assignedTo: '' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const run = async (work: () => Promise<void>, notice: string) => {
    setActionError(''); setSuccess(''); setSaving(true)
    try { await work(); await resource.reload(); setSuccess(notice) } catch (error) { setActionError(error instanceof Error ? error.message : 'Unable to complete this action.') } finally { setSaving(false) }
  }

  const records = resource.data
  const role = currentUser?.role
  const canPublish = role === USER_ROLES.superAdmin || role === USER_ROLES.hod || role === USER_ROLES.faculty
  const canSubmitComplaint = role === USER_ROLES.student || role === USER_ROLES.faculty
  const canReviewComplaints = role === USER_ROLES.superAdmin || role === USER_ROLES.hod
  const shows = (section: CommunicationSection) => sections.includes(section)
  const solo = sections.length === 1 ? sections[0] : null
  const heading = solo ? headings[solo] : { title: 'Department operations', description: 'Live announcements, complaint handling, and direct messages. Private file previews expire after five minutes.', search: 'Search announcements, complaints, or messages' }
  if (resource.isLoading) return <LoadingState label={`Loading ${heading.title.toLowerCase()}…`} />
  if (resource.error || !records || !currentUser) return <div className="space-y-3"><ErrorState title={`${heading.title} unavailable`} description={resource.error ?? 'Your session is unavailable.'} /><Button variant="secondary" onClick={() => void resource.reload()}>Retry</Button></div>

  const visibleAnnouncements = records.announcements.filter((item) => `${item.title} ${item.message} ${item.category}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || item.audience === filter))
  const visibleComplaints = records.complaints.filter((item) => `${item.subject} ${item.category} ${item.status}`.toLowerCase().includes(query.toLowerCase()))
  const visibleMessages = records.messages.filter((item) => item.message.toLowerCase().includes(query.toLowerCase()))

  const openAnnouncement = (item?: AnnouncementRecord) => {
    setActionError(''); setSuccess('')
    setAnnouncement(item ? { id: item.id, title: item.title, message: item.message, category: item.category, priority: item.priority as 'low' | 'normal' | 'high', audience: item.audience, targetId: audienceTarget(item), publishDate: item.publish_date, expiryDate: item.expiry_date ?? '', file: null } : { ...initialAnnouncement(), audience: role === USER_ROLES.faculty ? 'assigned_students' : 'department' })
    setAnnouncementOpen(true)
  }
  // Announcements targeted at individuals used to require pasting profile UUIDs. Faculty may
  // only address students in the sections they teach; a HOD may address any in the department.
  const selectedRecipients = announcement.targetId.split(',').map((id) => id.trim()).filter(Boolean)
  const taughtSections = new Set(records.assignments.map((item) => item.sectionId))
  const targetableStudents = records.recipients.filter((person) => person.role === USER_ROLES.student
    && (role !== USER_ROLES.faculty || (person.section_id !== null && taughtSections.has(person.section_id))))

  const openReview = (item: ComplaintRecord) => { setActionError(''); setReview({ status: item.status === 'resolved' ? 'resolved' : 'in_review', response: item.response ?? '', assignedTo: item.assigned_to ?? '' }); setReviewing(item) }

  return <div className="space-y-6">
    <PageHeader title={heading.title} description={heading.description} actions={<div className="flex flex-wrap gap-2">{shows('announcements') && canPublish && <Button onClick={() => openAnnouncement()}><Plus className="size-4" /> Announcement</Button>}{shows('complaints') && canSubmitComplaint && <Button variant={solo === 'complaints' ? 'primary' : 'secondary'} onClick={() => { setActionError(''); setComplaint(initialComplaint()); setComplaintOpen(true) }}><Plus className="size-4" /> {solo === 'complaints' ? 'Raise complaint' : 'Complaint'}</Button>}{shows('messages') && <Button variant="secondary" onClick={() => { setActionError(''); setMessage({ recipientId: '', body: '' }); setMessageOpen(true) }}><Mail className="size-4" /> Message</Button>}<Button variant="secondary" onClick={() => void resource.reload()}>Refresh</Button></div>} />
    {(actionError || success) && <div className="space-y-3">{actionError && <ErrorState title="Operation needs attention" description={actionError} />}{success && <div role="status" className="rounded-xl border border-success/30 bg-success/5 p-4 text-sm font-medium text-text">{success}</div>}</div>}
    <Card><div className={`grid gap-3 ${shows('announcements') ? 'md:grid-cols-[1fr_12rem]' : ''}`}><label className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={heading.search} /></label>{shows('announcements') && <Select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All announcement audiences</option>{audiences.map((audience) => <option key={audience} value={audience}>{audience.replace('_', ' ')}</option>)}</Select>}</div></Card>
    {shows('announcements') && <FloorDutyPanel duties={records.floorDuties} userId={currentUser.id} nameOf={(id) => records.recipients.find((row) => row.id === id)?.full_name ?? 'Unknown'} />}
    {shows('announcements') && <Card><div className="flex items-center gap-3"><Bell className="size-5 text-secondary" /><div><h2 className="font-bold text-text">Announcements</h2><p className="text-sm text-muted">You only see announcements addressed to you.</p></div></div><div className="mt-4"><DataTable rows={visibleAnnouncements} empty={<EmptyState title="No announcements match the current view" />} columns={[{ header: 'Announcement', render: (item) => <div className="max-w-md whitespace-normal"><p className="font-semibold">{item.title}</p><p className="whitespace-pre-line text-xs text-muted">{item.message}</p></div> }, { header: 'Audience', render: (item) => item.audience.replace('_', ' ') }, { header: 'Dates', render: (item) => <span className="text-xs">{item.publish_date}{item.expiry_date ? ` → ${item.expiry_date}` : ''}</span> }, { header: 'Priority', render: (item) => <Badge tone={tone(item.priority)}>{item.priority}</Badge> }, { header: 'Files / state', render: (item) => <div className="flex flex-wrap gap-2"><Button variant="ghost" className="min-h-8 px-2" disabled={saving} onClick={() => void run(() => departmentOperationsRepository.markAnnouncementRead(item.id), 'Announcement marked as read.')}>{item.readBy.includes(currentUser.id) ? 'Read' : 'Mark read'}</Button>{item.attachments.map((attachment) => <Button key={attachment.id} variant="ghost" className="min-h-8 px-2" onClick={() => setPreview(attachment)}><Paperclip className="size-3" /> Preview</Button>)}{(item.author_id === currentUser.id || canReviewComplaints) && <Button variant="ghost" className="min-h-8 px-2" onClick={() => openAnnouncement(item)}>Edit</Button>}</div> }]} /></div></Card>}
    {shows('complaints') && (canSubmitComplaint || canReviewComplaints) && <Card><div><h2 className="font-bold text-text">Complaints</h2><p className="text-sm text-muted">{canReviewComplaints ? 'Resolved complaints are locked in this workflow.' : 'Your submitted complaints and their current status.'}</p></div><div className="mt-4"><DataTable rows={visibleComplaints} empty={<EmptyState title="No complaints match the current view" />} columns={[{ header: 'Complaint', render: (item) => <div className="max-w-md whitespace-normal"><p className="font-semibold">{item.subject}</p><p className="text-xs text-muted">{item.description}</p></div> }, { header: 'Status', render: (item) => <Badge tone={tone(item.status)}>{item.status.replace('_', ' ')}</Badge> }, { header: 'History', render: (item) => <span className="text-xs text-muted">Submitted {formatDate(item.created_at)}{item.updated_at !== item.created_at ? ` · Updated ${formatDate(item.updated_at)}` : ''}{item.response ? ` · ${item.response}` : ''}</span> }, { header: 'Files / action', render: (item) => <div className="flex flex-wrap gap-2">{item.attachments.map((attachment) => <Button key={attachment.id} variant="ghost" className="min-h-8 px-2" onClick={() => setPreview(attachment)}><Paperclip className="size-3" /> Preview</Button>)}{canReviewComplaints && <Button variant="ghost" className="min-h-8 px-2" disabled={item.status === 'resolved'} onClick={() => openReview(item)}>{item.status === 'resolved' ? 'Locked' : 'Review'}</Button>}</div> }]} /></div></Card>}
    {shows('messages') && <MessagePanel messages={visibleMessages} userId={currentUser.id} saving={saving} onRead={(id) => void run(() => departmentOperationsRepository.markMessageRead(id), 'Message marked as read.')} onArchive={(id) => void run(() => departmentOperationsRepository.archiveMessage(id), 'Message archived.')} />}
    <Modal isOpen={announcementOpen} title={announcement.id ? 'Edit announcement' : 'Publish announcement'} onClose={() => !saving && setAnnouncementOpen(false)}><div className="space-y-3"><label className="text-sm font-semibold">Title<Input className="mt-1" value={announcement.title} onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })} /></label><label className="text-sm font-semibold">Message<Textarea className="mt-1" value={announcement.message} onChange={(event) => setAnnouncement({ ...announcement, message: event.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Audience<Select className="mt-1" disabled={role === USER_ROLES.faculty} value={announcement.audience} onChange={(event) => setAnnouncement({ ...announcement, audience: event.target.value, targetId: '' })}>{audiences.map((audience) => <option key={audience} value={audience}>{audience.replace('_', ' ')}</option>)}</Select></label><label className="text-sm font-semibold">Priority<Select className="mt-1" value={announcement.priority} onChange={(event) => setAnnouncement({ ...announcement, priority: event.target.value as typeof announcement.priority })}><option value="low">low</option><option value="normal">normal</option><option value="high">high</option></Select></label><label className="text-sm font-semibold">Publish date<Input className="mt-1" type="date" value={announcement.publishDate} onChange={(event) => setAnnouncement({ ...announcement, publishDate: event.target.value })} /></label><label className="text-sm font-semibold">Expiry date<Input className="mt-1" type="date" value={announcement.expiryDate} onChange={(event) => setAnnouncement({ ...announcement, expiryDate: event.target.value })} /></label></div>{announcement.audience === 'section' && <label className="text-sm font-semibold">Section<Select className="mt-1" value={announcement.targetId} onChange={(event) => setAnnouncement({ ...announcement, targetId: event.target.value })}><option value="">Choose a section</option>{records.sections.map((row) => <option key={row.id} value={row.id}>Year {row.year_number} · {row.name}</option>)}</Select></label>}
      {announcement.audience === 'assigned_students' && <label className="text-sm font-semibold">Recipients<span className="mt-1 block max-h-52 overflow-y-auto rounded-lg border border-border p-2">{targetableStudents.length === 0 ? <span className="text-sm font-normal text-muted">No students are available for you to address.</span> : targetableStudents.map((student) => { const selected = selectedRecipients.includes(student.id); return <label key={student.id} className="flex items-center gap-2 py-1 text-sm font-normal"><input type="checkbox" className="size-4 rounded border-border" checked={selected} onChange={() => setAnnouncement({ ...announcement, targetId: (selected ? selectedRecipients.filter((id) => id !== student.id) : [...selectedRecipients, student.id]).join(',') })} />{student.full_name}</label> })}</span><span className="mt-1 block text-xs font-normal text-muted">{selectedRecipients.length} selected</span></label>}<label className="text-sm font-semibold">Category<Input className="mt-1" value={announcement.category} onChange={(event) => setAnnouncement({ ...announcement, category: event.target.value })} /></label><PrivateFileInput label="Optional private attachment" file={announcement.file} onFile={(file) => setAnnouncement({ ...announcement, file })} onError={setActionError} disabled={saving} /><div className="flex justify-end"><Button disabled={saving} onClick={() => void run(async () => { await departmentOperationsRepository.saveAnnouncement(announcement); setAnnouncementOpen(false) }, announcement.id ? 'Announcement updated.' : 'Announcement published.')}>{saving ? 'Saving…' : announcement.id ? 'Save changes' : 'Publish'}</Button></div></div></Modal>
    <Modal isOpen={complaintOpen} title="Submit complaint" onClose={() => !saving && setComplaintOpen(false)}><div className="space-y-3"><label className="text-sm font-semibold">Category<Select className="mt-1" value={complaint.category} onChange={(event) => setComplaint({ ...complaint, category: event.target.value })}><option>Infrastructure</option><option>Academic</option><option>Harassment</option><option>Other</option></Select></label><label className="text-sm font-semibold">Subject<Input className="mt-1" value={complaint.subject} onChange={(event) => setComplaint({ ...complaint, subject: event.target.value })} /></label><label className="text-sm font-semibold">Description<Textarea className="mt-1" value={complaint.description} onChange={(event) => setComplaint({ ...complaint, description: event.target.value })} /></label><PrivateFileInput label="Optional private attachment" file={complaint.file} onFile={(file) => setComplaint({ ...complaint, file })} onError={setActionError} disabled={saving} /><div className="flex justify-end"><Button disabled={saving} onClick={() => void run(async () => { await departmentOperationsRepository.submitComplaint(complaint); setComplaintOpen(false) }, 'Complaint submitted.')}>{saving ? 'Submitting…' : 'Submit complaint'}</Button></div></div></Modal>
    <Modal isOpen={Boolean(reviewing)} title="Review complaint" onClose={() => !saving && setReviewing(null)}><div className="space-y-3"><label className="text-sm font-semibold">Status<Select className="mt-1" value={review.status} onChange={(event) => setReview({ ...review, status: event.target.value as typeof review.status })}><option value="in_review">in review</option><option value="resolved">resolved</option></Select></label><label className="text-sm font-semibold">Assign to active user (optional)<Select className="mt-1" value={review.assignedTo} onChange={(event) => setReview({ ...review, assignedTo: event.target.value })}><option value="">Unassigned</option>{records.recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.full_name} · {recipient.role}</option>)}</Select></label><label className="text-sm font-semibold">Response<Textarea className="mt-1" value={review.response} onChange={(event) => setReview({ ...review, response: event.target.value })} /></label><div className="flex justify-end"><Button disabled={saving || !reviewing} onClick={() => { if (reviewing) void run(async () => { await departmentOperationsRepository.reviewComplaint({ id: reviewing.id, status: review.status, response: review.response, assignedTo: review.assignedTo || null }); setReviewing(null) }, 'Complaint updated.') }}>{saving ? 'Saving…' : 'Save review'}</Button></div></div></Modal>
    <Modal isOpen={messageOpen} title="Send message" onClose={() => !saving && setMessageOpen(false)}><div className="space-y-3"><label className="text-sm font-semibold">Recipient<Select className="mt-1" value={message.recipientId} onChange={(event) => setMessage({ ...message, recipientId: event.target.value })}><option value="">Select an active department user</option>{records.recipients.filter((recipient) => recipient.id !== currentUser.id).map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.full_name} · {recipient.role}</option>)}</Select></label><label className="text-sm font-semibold">Message<Textarea className="mt-1" value={message.body} onChange={(event) => setMessage({ ...message, body: event.target.value })} /></label><div className="flex justify-end"><Button disabled={saving} onClick={() => void run(async () => { await departmentOperationsRepository.sendMessage({ recipientId: message.recipientId, message: message.body }); setMessageOpen(false) }, 'Message sent.')}>{saving ? 'Sending…' : 'Send message'}</Button></div></div></Modal>
    {preview && <SecureAttachmentPreview attachment={preview} onClose={() => setPreview(null)} />}
  </div>
}

function audienceTarget(item: AnnouncementRecord) {
  if (item.audience === 'section' && typeof item.target === 'object' && item.target !== null && !Array.isArray(item.target) && typeof item.target.section_id === 'string') return item.target.section_id
  if (item.audience === 'assigned_students' && typeof item.target === 'object' && item.target !== null && !Array.isArray(item.target) && Array.isArray(item.target.profile_ids)) return item.target.profile_ids.filter((id): id is string => typeof id === 'string').join(', ')
  return ''
}

function formatDate(value: string) { return new Date(value).toLocaleString() }

const dutyDayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const dutyTime = (duty: FloorDutyRecord) => duty.starts_at && duty.ends_at ? `${duty.starts_at.slice(0, 5)} – ${duty.ends_at.slice(0, 5)}` : '—'

/**
 * Floor duty used to be one department-wide announcement listing all fifteen slots, so every
 * faculty member had to read the whole roster to find their own turns. This shows the signed-in
 * person their own duty first, with the full roster available for anyone who needs to arrange
 * a swap.
 */
function FloorDutyPanel({ duties, userId, nameOf }: { duties: FloorDutyRecord[]; userId: string; nameOf: (id: string) => string }) {
  const [showAll, setShowAll] = useState(false)
  if (!duties.length) return null
  const mine = duties.filter((duty) => duty.faculty_id === userId)
  const today = new Date().getDay() === 0 ? 7 : new Date().getDay()

  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <CalendarClock className="size-5 text-secondary" />
        <div>
          <h2 className="font-bold text-text">My floor duty</h2>
          <p className="text-sm text-muted">{mine.length ? `You are on duty ${mine.length} time${mine.length === 1 ? '' : 's'} a week.` : 'You have no floor duty this semester.'}</p>
        </div>
      </div>
      <Button variant="secondary" className="min-h-9" onClick={() => setShowAll(!showAll)}>{showAll ? 'Hide full roster' : 'View full roster'}</Button>
    </div>

    {mine.length > 0 && <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {mine.map((duty) => <li key={duty.id} className={`rounded-lg border p-3 ${duty.day_of_week === today ? 'border-secondary bg-secondary/5' : 'border-border bg-background'}`}>
        <p className="text-sm font-bold text-text">{dutyDayNames[duty.day_of_week]}{duty.day_of_week === today && <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-secondary">Today</span>}</p>
        <p className="text-sm text-text">{duty.shift}</p>
        <p className="text-xs text-muted">{dutyTime(duty)}</p>
      </li>)}
    </ul>}

    {showAll && <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-sm font-bold text-text">Full roster · odd semester 2026&ndash;27</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((day) => <div key={day} className="rounded-lg border border-border p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{dutyDayNames[day]}</p>
          <ul className="mt-2 space-y-2">
            {duties.filter((duty) => duty.day_of_week === day).map((duty) => <li key={duty.id}>
              <p className="text-xs text-muted">{duty.shift} · {dutyTime(duty)}</p>
              <p className={`text-sm ${duty.faculty_id === userId ? 'font-bold text-secondary' : 'text-text'}`}>{nameOf(duty.faculty_id)}</p>
            </li>)}
          </ul>
        </div>)}
      </div>
    </div>}
  </Card>
}

function MessagePanel({ messages, userId, saving, onRead, onArchive }: { messages: MessageRecord[]; userId: string; saving: boolean; onRead: (id: string) => void; onArchive: (id: string) => void }) {
  const inbox = messages.filter((item) => item.recipient_id === userId && !item.archived_at)
  const sent = messages.filter((item) => item.sender_id === userId)
  return <Card><div><h2 className="font-bold text-text">Messages</h2><p className="text-sm text-muted">Inbox {inbox.length} · Sent {sent.length}. The live schema supports direct messages only.</p></div><div className="mt-4"><DataTable rows={inbox} empty={<EmptyState title="No inbox messages" />} columns={[{ header: 'Message', render: (item) => <div className="max-w-lg whitespace-normal">{item.message}</div> }, { header: 'Received', render: (item) => formatDate(item.created_at) }, { header: 'State', render: (item) => <Badge tone={tone(item.read_at ? 'read' : 'unread')}>{item.read_at ? 'read' : 'unread'}</Badge> }, { header: 'Action', render: (item) => <div className="flex gap-2"><Button disabled={saving || Boolean(item.read_at)} className="min-h-8 px-2" variant="ghost" onClick={() => onRead(item.id)}>Read</Button><Button disabled={saving} className="min-h-8 px-2" variant="ghost" onClick={() => onArchive(item.id)}>Archive</Button></div> }]} /></div></Card>
}
