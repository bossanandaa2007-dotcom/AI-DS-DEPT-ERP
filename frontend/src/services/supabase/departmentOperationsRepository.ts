import { supabase } from '@/lib/supabase'
import { privateFileRepository, PRIVATE_FILE_BUCKET, type AttachmentRow } from '@/services/supabase/privateFileRepository'
import type { Database, Json } from '@/types/database.types'

type Tables = Database['public']['Tables']
type Profile = Pick<Tables['profiles']['Row'], 'id' | 'full_name' | 'role' | 'status' | 'department_id' | 'section_id'>
type Audience = 'department' | 'faculty' | 'students' | 'lab_assistants' | 'section' | 'assigned_students'

export type OperationsContext = { id: string; role: Database['public']['Enums']['app_role']; department_id: string; section_id: string | null }
export type PortionRecord = Tables['portion_updates']['Row']
export type AnnouncementRecord = Tables['announcements']['Row'] & { attachments: AttachmentRow[]; readBy: string[] }
export type ComplaintRecord = Tables['complaints']['Row'] & { attachments: AttachmentRow[] }
export type MessageRecord = Tables['messages']['Row']
export type AuditLogRecord = Tables['audit_logs']['Row']
export type AssignmentOption = { id: string; subjectId: string; sectionId: string; label: string }

/**
 * `public.floor_duties` is created by 202608060112_floor_duties.sql, which postdates the
 * generated `database.types.ts`, so it is described here instead. Regenerate the types and
 * this shape plus `looseFrom` below can both go.
 */
export type FloorDutyRecord = {
  id: string
  department_id: string
  academic_year_id: string
  faculty_id: string
  day_of_week: number
  shift: string
  starts_at: string | null
  ends_at: string | null
  display_order: number
  is_active: boolean
}

export type OperationsData = {
  context: OperationsContext
  portions: PortionRecord[]
  assignments: AssignmentOption[]
  announcements: AnnouncementRecord[]
  complaints: ComplaintRecord[]
  messages: MessageRecord[]
  recipients: Profile[]
  timetable: Tables['timetable_entries']['Row'][]
  floorDuties: FloorDutyRecord[]
  sections: Pick<Tables['sections']['Row'], 'id' | 'name' | 'year_number'>[]
}

const client = () => {
  if (!supabase) throw new Error('Supabase is not configured. Set the browser-safe Supabase environment variables.')
  return supabase
}

/** Single cast site for tables the generated types do not know about yet. */
type LooseResult = { data: unknown[] | null; error: { message: string; code?: string } | null }
const looseFrom = (table: string) => (client() as unknown as { from: (name: string) => { select: (columns: string) => PromiseLike<LooseResult> } }).from(table)

const message = (error: { message: string; code?: string } | null, fallback: string) => {
  if (!error) return
  if (error.code === '23505' || /duplicate|unique/i.test(error.message)) throw new Error('A matching record already exists.')
  if (/policy|permission|not authorized|row-level/i.test(error.message)) throw new Error('You are not authorized to perform this action.')
  throw new Error(error.message || fallback)
}

const asAudience = (value: string): Audience => {
  if (value === 'department' || value === 'faculty' || value === 'students' || value === 'lab_assistants' || value === 'section' || value === 'assigned_students') return value
  throw new Error('This announcement audience is not supported by the live access policy.')
}

const currentContext = async (): Promise<OperationsContext> => {
  const { data: auth, error: authError } = await client().auth.getUser()
  message(authError, 'Unable to verify your session.')
  if (!auth.user) throw new Error('Please sign in again to continue.')
  const { data, error } = await client().from('profiles').select('id,role,department_id,section_id').eq('id', auth.user.id).single()
  message(error, 'Unable to load your department context.')
  if (!data?.department_id) throw new Error('Your profile must be assigned to a department.')
  return { ...data, department_id: data.department_id }
}

async function attachmentMap(entityType: 'announcement' | 'complaint', entityIds: string[]) {
  if (!entityIds.length) return new Map<string, AttachmentRow[]>()
  const { data, error } = await client().from('attachments').select('*').eq('entity_type', entityType).in('entity_id', entityIds).eq('is_active', true)
  message(error, 'Unable to load private attachment metadata.')
  return (data ?? []).reduce((map, attachment) => {
    const current = map.get(attachment.entity_id) ?? []
    current.push(attachment)
    map.set(attachment.entity_id, current)
    return map
  }, new Map<string, AttachmentRow[]>())
}

async function listAnnouncements(): Promise<AnnouncementRecord[]> {
  const { data, error } = await client().from('announcements').select('*,announcement_reads(profile_id)').order('publish_date', { ascending: false })
  message(error, 'Unable to load announcements.')
  const rows = data ?? []
  const attachments = await attachmentMap('announcement', rows.map((row) => row.id))
  return rows.map((row) => ({ ...row, attachments: attachments.get(row.id) ?? [], readBy: (row.announcement_reads ?? []).map((read) => read.profile_id) }))
}

async function listComplaints(): Promise<ComplaintRecord[]> {
  const { data, error } = await client().from('complaints').select('*').order('updated_at', { ascending: false })
  message(error, 'Unable to load complaints.')
  const rows = data ?? []
  const attachments = await attachmentMap('complaint', rows.map((row) => row.id))
  return rows.map((row) => ({ ...row, attachments: attachments.get(row.id) ?? [] }))
}

async function listAssignments(context: OperationsContext): Promise<AssignmentOption[]> {
  if (context.role !== 'faculty') return []
  const { data, error } = await client().from('faculty_assignments').select('id,subject_id,section_id,subjects(name,code),sections(name)').eq('faculty_id', context.id).eq('is_active', true).not('subject_id', 'is', null)
  message(error, 'Unable to load your active subject assignments.')
  return (data ?? []).flatMap((assignment) => {
    if (!assignment.subject_id) return []
    const subject = Array.isArray(assignment.subjects) ? assignment.subjects[0] : assignment.subjects
    const section = Array.isArray(assignment.sections) ? assignment.sections[0] : assignment.sections
    return [{ id: assignment.id, subjectId: assignment.subject_id, sectionId: assignment.section_id, label: `${subject?.code ?? 'Subject'} · ${subject?.name ?? assignment.subject_id} · ${section?.name ?? assignment.section_id}` }]
  })
}

export const departmentOperationsRepository = {
  async load(): Promise<OperationsData> {
    const context = await currentContext()
    const [portionsResult, assignments, announcements, complaints, messages, recipientsResult, timetableResult, floorDutiesResult, sectionsResult] = await Promise.all([
      client().from('portion_updates').select('*').order('updated_at', { ascending: false }),
      listAssignments(context),
      listAnnouncements(),
      listComplaints(),
      client().from('messages').select('*').order('created_at', { ascending: false }),
      client().from('profiles').select('id,full_name,role,status,department_id,section_id').eq('department_id', context.department_id).eq('status', 'active').order('full_name'),
      client().from('timetable_entries').select('*').order('day_of_week').order('period'),
      looseFrom('floor_duties').select('*'),
      client().from('sections').select('id,name,year_number').order('year_number').order('name'),
    ])
    message(portionsResult.error, 'Unable to load portion progress.')
    message(messages.error, 'Unable to load messages.')
    message(recipientsResult.error, 'Unable to load available message recipients.')
    message(timetableResult.error, 'Unable to load timetable entries.')
    // Students cannot read the roster and the table may predate this deployment, so a failure
    // here degrades to an empty list rather than breaking the whole page.
    const floorDuties = (floorDutiesResult.error ? [] : (floorDutiesResult.data ?? []) as FloorDutyRecord[])
      .filter((duty) => duty.is_active)
      .sort((a, b) => a.day_of_week - b.day_of_week || a.display_order - b.display_order)
    return { context, portions: portionsResult.data ?? [], assignments, announcements, complaints, messages: messages.data ?? [], recipients: recipientsResult.data ?? [], timetable: timetableResult.data ?? [], floorDuties, sections: sectionsResult.data ?? [] }
  },

  async savePortion(input: { timetableEntryId: string; subjectId: string; sectionId: string; unit: string; plannedTopic: string; completedTopic: string; completionPercentage: number; nextTopic: string }) {
    const context = await currentContext()
    if (context.role !== 'faculty') throw new Error('Only Faculty can submit portion updates.')
    if (!input.unit.trim() || !input.plannedTopic.trim() || !input.completedTopic.trim()) throw new Error('Unit, planned topic, and completed topic are required.')
    if (!Number.isFinite(input.completionPercentage) || input.completionPercentage < 0 || input.completionPercentage > 100) throw new Error('Completion percentage must be between 0 and 100.')
    const { data: assignment, error: assignmentError } = await client().from('faculty_assignments').select('id').eq('faculty_id', context.id).eq('subject_id', input.subjectId).eq('section_id', input.sectionId).eq('is_active', true).maybeSingle()
    message(assignmentError, 'Unable to verify your active subject assignment.')
    if (!assignment) throw new Error('You need an active subject assignment for this section before updating portion progress.')
    const { data: timetable, error: timetableError } = await client().from('timetable_entries').select('id').eq('id', input.timetableEntryId).eq('faculty_id', context.id).eq('subject_id', input.subjectId).eq('section_id', input.sectionId).maybeSingle()
    message(timetableError, 'Unable to verify the selected timetable entry.')
    if (!timetable) throw new Error('Choose one of your assigned timetable entries.')
    const { data: duplicates, error: duplicateError } = await client().from('portion_updates').select('id').eq('timetable_entry_id', input.timetableEntryId).eq('unit', input.unit.trim()).limit(2)
    message(duplicateError, 'Unable to check existing portion updates.')
    const payload = { planned_topic: input.plannedTopic.trim(), completed_topic: input.completedTopic.trim(), completion_percentage: input.completionPercentage, next_topic: input.nextTopic.trim() || null }
    if ((duplicates ?? []).length > 1) throw new Error('Duplicate portion records already exist for this timetable entry and unit. Contact the department administrator.')
    if (duplicates?.[0]) {
      const { data, error } = await client().from('portion_updates').update(payload).eq('id', duplicates[0].id).select().single()
      message(error, 'Unable to update the portion record.')
      return data
    }
    const { data, error } = await client().from('portion_updates').insert({ ...payload, timetable_entry_id: input.timetableEntryId, faculty_id: context.id, subject_id: input.subjectId, section_id: input.sectionId, unit: input.unit.trim() }).select().single()
    message(error, 'Unable to save the portion record.')
    return data
  },

  async saveAnnouncement(input: { id?: string; title: string; message: string; category: string; priority: 'low' | 'normal' | 'high'; audience: string; targetId: string; publishDate: string; expiryDate: string; file: File | null }) {
    const context = await currentContext()
    if (!['super_admin', 'hod', 'faculty'].includes(context.role)) throw new Error('Your role cannot publish announcements.')
    const audience = asAudience(input.audience)
    if (context.role === 'faculty' && audience !== 'assigned_students') throw new Error('Faculty announcements must be addressed to assigned students.')
    if (!input.title.trim() || !input.message.trim() || !input.category.trim()) throw new Error('Title, message, and category are required.')
    if (!input.publishDate) throw new Error('A publish date is required.')
    if (input.expiryDate && input.expiryDate < input.publishDate) throw new Error('Expiry date must be on or after the publish date.')
    const target: Json = audience === 'section' ? { section_id: input.targetId.trim() } : audience === 'assigned_students' ? { profile_ids: input.targetId.split(',').map((id) => id.trim()).filter(Boolean) } : {}
    if ((audience === 'section' || audience === 'assigned_students') && !input.targetId.trim()) throw new Error('Provide the required section or recipient profile ID for this audience.')
    const payload = { author_id: context.id, department_id: context.department_id as string, title: input.title.trim(), message: input.message.trim(), category: input.category.trim(), priority: input.priority, audience, target, publish_date: input.publishDate, expiry_date: input.expiryDate || null }
    let announcementId = input.id
    if (announcementId) {
      const { error } = await client().from('announcements').update(payload).eq('id', announcementId)
      message(error, 'Unable to update the announcement.')
    } else {
      const { data, error } = await client().from('announcements').insert(payload).select('id').single()
      message(error, 'Unable to publish the announcement.')
      if (!data) throw new Error('The announcement was saved but its ID was not returned.')
      announcementId = data.id
    }
    if (input.file) await privateFileRepository.uploadAndRegisterAttachment({ entityId: announcementId, entityType: 'announcement', bucket: PRIVATE_FILE_BUCKET.announcement, module: 'announcements', file: input.file })
  },

  async markAnnouncementRead(announcementId: string) {
    const context = await currentContext()
    const { error } = await client().from('announcement_reads').upsert({ announcement_id: announcementId, profile_id: context.id }, { onConflict: 'announcement_id,profile_id', ignoreDuplicates: true })
    message(error, 'Unable to mark the announcement as read.')
  },

  async submitComplaint(input: { category: string; subject: string; description: string; file: File | null }) {
    const context = await currentContext()
    if (context.role !== 'student' && context.role !== 'faculty') throw new Error('Only students and Faculty can submit complaints.')
    if (!input.category.trim() || !input.subject.trim() || !input.description.trim()) throw new Error('Category, subject, and description are required.')
    const { data, error } = await client().from('complaints').insert({ student_id: context.id, department_id: context.department_id as string, category: input.category.trim(), subject: input.subject.trim(), description: input.description.trim() }).select('id').single()
    message(error, 'Unable to submit the complaint.')
    if (!data) throw new Error('The complaint was saved but its ID was not returned.')
    if (input.file) await privateFileRepository.uploadAndRegisterAttachment({ entityId: data.id, entityType: 'complaint', bucket: PRIVATE_FILE_BUCKET.complaint, module: 'complaints', file: input.file })
  },

  async reviewComplaint(input: { id: string; status: 'in_review' | 'resolved'; response: string; assignedTo: string | null }) {
    const context = await currentContext()
    if (context.role !== 'super_admin' && context.role !== 'hod') throw new Error('Only HOD or Super Admin can review complaints.')
    if (!input.response.trim()) throw new Error('Add a response before changing complaint status.')
    const { data: current, error: currentError } = await client().from('complaints').select('status').eq('id', input.id).single()
    message(currentError, 'Unable to load the complaint.')
    if (!current) throw new Error('Complaint was not found.')
    if (current.status === 'resolved') throw new Error('Resolved complaints are read-only.')
    const { error } = await client().from('complaints').update({ status: input.status, response: input.response.trim(), assigned_to: input.assignedTo }).eq('id', input.id)
    message(error, 'Unable to update the complaint.')
  },

  async sendMessage(input: { recipientId: string; message: string }) {
    const context = await currentContext()
    if (!input.message.trim()) throw new Error('Message text is required.')
    if (input.recipientId === context.id) throw new Error('Choose another active user as the recipient.')
    const { data: recipient, error: recipientError } = await client().from('profiles').select('id,status,department_id').eq('id', input.recipientId).maybeSingle()
    message(recipientError, 'Unable to verify the message recipient.')
    if (!recipient || recipient.status !== 'active' || recipient.department_id !== context.department_id) throw new Error('Messages can be sent only to active users in your department.')
    const { error } = await client().from('messages').insert({ sender_id: context.id, recipient_id: input.recipientId, message: input.message.trim() })
    message(error, 'Unable to send the message.')
  },

  async markMessageRead(id: string) {
    const { error } = await client().from('messages').update({ read_at: new Date().toISOString() }).eq('id', id)
    message(error, 'Unable to mark the message as read.')
  },

  async archiveMessage(id: string) {
    const { error } = await client().from('messages').update({ archived_at: new Date().toISOString() }).eq('id', id)
    message(error, 'Unable to archive the message.')
  },

  async loadAudit() {
    const context = await currentContext()
    if (context.role !== 'super_admin' && context.role !== 'hod') throw new Error('Audit activity is available only to department administrators.')
    const [logsResult, profilesResult] = await Promise.all([
      client().from('audit_logs').select('*').order('created_at', { ascending: false }),
      client().from('profiles').select('id,full_name,role,status,department_id,section_id'),
    ])
    message(logsResult.error, 'Unable to load audit activity.')
    message(profilesResult.error, 'Unable to load audit actors.')
    const profiles = profilesResult.data ?? []
    const records = context.role === 'hod' ? (logsResult.data ?? []).filter((log) => profiles.some((profile) => profile.id === log.actor_id && profile.department_id === context.department_id)) : logsResult.data ?? []
    return { context, records, profiles, references: await auditReferences(profiles) }
  },
}

/**
 * Audit rows identify their subject by raw UUID, in `record_reference` and inside the metadata
 * payloads. Showing those to a HOD is noise — `d277d43b-ca34-42c7-a9d2-b6f...` says nothing
 * about which request was approved. This builds one lookup from every id an audit row is
 * likely to name, so the page can print "Leave · Boss Anandaa S" instead.
 *
 * Anything still unresolved is a record that has since been deleted, or one this viewer cannot
 * read; the page says so rather than falling back to the UUID.
 */
async function auditReferences(profiles: Profile[]) {
  const labels = new Map<string, string>()
  for (const profile of profiles) labels.set(profile.id, profile.full_name)

  const [departments, sections, subjects, sessions, assessments, requests, attachments] = await Promise.all([
    client().from('departments').select('id,name'),
    client().from('sections').select('id,year_number,name'),
    client().from('subjects').select('id,code,name'),
    client().from('attendance_sessions').select('id,section_id,subject_id,attendance_date,period,session_type'),
    client().from('assessments').select('id,title,subject_id'),
    client().from('requests').select('id,request_type,requester_id'),
    client().from('attachments').select('id,filename'),
  ])

  for (const row of departments.data ?? []) labels.set(row.id, row.name)
  const sectionLabel = new Map<string, string>()
  for (const row of sections.data ?? []) {
    const label = `Year ${row.year_number} · ${row.name}`
    sectionLabel.set(row.id, label)
    labels.set(row.id, label)
  }
  const subjectLabel = new Map<string, string>()
  for (const row of subjects.data ?? []) {
    subjectLabel.set(row.id, row.code)
    labels.set(row.id, `${row.code} · ${row.name}`)
  }
  for (const row of sessions.data ?? []) {
    const parts = [subjectLabel.get(row.subject_id ?? '') ?? row.session_type, sectionLabel.get(row.section_id), row.attendance_date, row.period ? `P${row.period}` : null]
    labels.set(row.id, parts.filter(Boolean).join(' · '))
  }
  for (const row of assessments.data ?? []) {
    labels.set(row.id, [row.title, subjectLabel.get(row.subject_id ?? '')].filter(Boolean).join(' · '))
  }
  for (const row of requests.data ?? []) {
    labels.set(row.id, [row.request_type.replaceAll('_', ' '), labels.get(row.requester_id)].filter(Boolean).join(' · '))
  }
  for (const row of attachments.data ?? []) labels.set(row.id, row.filename)

  return labels
}
