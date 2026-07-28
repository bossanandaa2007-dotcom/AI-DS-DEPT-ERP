import { Eye, Paperclip, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'

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
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { PrivateFileInput } from '@/modules/document-reviews/PrivateFileInput'
import { SecureAttachmentPreview } from '@/modules/document-reviews/SecureAttachmentPreview'
import { departmentOperationsRepository, type ComplaintRecord } from '@/services/supabase/departmentOperationsRepository'
import type { AttachmentRow } from '@/services/supabase/privateFileRepository'

type Form = { category: string; subject: string; description: string; priority: string; file: File | null }
const emptyForm = (): Form => ({ category: 'Infrastructure', subject: '', description: '', priority: 'normal', file: null })
const terminal = new Set(['resolved', 'closed', 'rejected'])
const tone = (status: string): 'primary' | 'success' | 'warning' | 'muted' => terminal.has(status) ? status === 'resolved' || status === 'closed' ? 'success' : 'muted' : status === 'submitted' ? 'warning' : 'primary'
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
const ref = (id: string) => `CMP-${id.slice(0, 8).toUpperCase()}`

export function StudentComplaintsPage() {
  const { currentUser } = useAuth()
  const resource = useAsyncResource(useCallback(() => departmentOperationsRepository.load(), []))
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(() => emptyForm())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [fileError, setFileError] = useState('')
  const [preview, setPreview] = useState<AttachmentRow | null>(null)

  if (resource.isLoading) return <LoadingState label="Loading complaints..." />
  if (resource.error || !resource.data || !currentUser) return <div className="space-y-3"><ErrorState title="Unable to load complaints" description={resource.error ?? 'Your session is unavailable.'} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>

  const data = resource.data
  const complaints = data.complaints.filter((item) => item.student_id === currentUser.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const submit = async () => {
    if (form.subject.trim().length < 3 || form.description.trim().length < 10) { setMessage('Enter a subject and at least 10 characters of description.'); return }
    setSaving(true); setMessage('')
    try {
      await departmentOperationsRepository.submitComplaint({ category: form.category, subject: form.subject, description: `Priority: ${label(form.priority)}\n${form.description}`, file: form.file })
      await resource.reload(); setOpen(false); setForm(emptyForm())
      setMessage('Complaint submitted.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to submit complaint.') } finally { setSaving(false) }
  }

  return <div className="space-y-6">
    <PageHeader title="Complaints" description="Create and track your own complaint records through the department workflow." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button><Button onClick={() => { setForm(emptyForm()); setFileError(''); setOpen(true) }}><Plus className="size-4" /> New complaint</Button></div>} />
    {message && <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${message.includes('submitted') ? 'border-success/30 bg-success/5 text-success' : 'border-error/30 bg-error/5 text-error'}`}>{message}</p>}
    {!complaints.length ? <EmptyState title="No complaints submitted" description="Your complaint status and responses will appear here." /> : <div className="grid gap-4 lg:grid-cols-2">{complaints.map((complaint) => <ComplaintCard key={complaint.id} complaint={complaint} people={data.recipients} onPreview={setPreview} />)}</div>}
    <Modal isOpen={open} title="Submit complaint" onClose={() => !saving && setOpen(false)}><div className="space-y-3"><label className="text-sm font-semibold">Category<Select className="mt-1" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Infrastructure</option><option>Academic</option><option>Harassment</option><option>Other</option></Select></label><label className="text-sm font-semibold">Priority<Select className="mt-1" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></Select></label><label className="text-sm font-semibold">Subject<Input className="mt-1" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label><label className="text-sm font-semibold">Description<Textarea className="mt-1" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><PrivateFileInput label="Optional private attachment" file={form.file} onFile={(file) => setForm({ ...form, file })} onError={setFileError} disabled={saving} />{fileError && <p role="alert" className="text-sm text-error">{fileError}</p>}<div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || Boolean(fileError)} onClick={() => void submit()}>{saving ? 'Submitting...' : 'Submit complaint'}</Button></div></div></Modal>
    {preview && <SecureAttachmentPreview attachment={preview} onClose={() => setPreview(null)} />}
  </div>
}

function ComplaintCard({ complaint, people, onPreview }: { complaint: ComplaintRecord; people: Array<{ id: string; full_name: string }>; onPreview: (attachment: AttachmentRow) => void }) {
  const assigned = complaint.assigned_to ? people.find((person) => person.id === complaint.assigned_to)?.full_name ?? 'Assigned authority' : 'Not assigned'
  const resolved = terminal.has(complaint.status) ? new Date(complaint.updated_at).toLocaleString() : '-'
  return <Card className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-muted">{ref(complaint.id)}</p><h2 className="mt-1 font-bold text-text">{complaint.subject}</h2><p className="text-sm text-muted">{complaint.category}</p></div><Badge tone={tone(complaint.status)}>{label(complaint.status)}</Badge></div><p className="mt-3 whitespace-pre-wrap text-sm text-text">{complaint.description}</p><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><Meta label="Submitted" value={new Date(complaint.created_at).toLocaleString()} /><Meta label="Assigned authority" value={assigned} /><Meta label="Response" value={complaint.response ?? 'Awaiting response'} /><Meta label="Resolution date" value={resolved} /></div><div className="mt-4 flex flex-wrap gap-2">{complaint.attachments.map((attachment) => <Button key={attachment.id} variant="ghost" className="min-h-8 px-2" onClick={() => onPreview(attachment)}><Eye className="size-3" /> Attachment</Button>)}{!complaint.attachments.length && <span className="flex items-center gap-1 text-xs text-muted"><Paperclip className="size-3" /> No attachment</span>}</div></Card>
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="font-medium text-text">{value}</p></div>
}
