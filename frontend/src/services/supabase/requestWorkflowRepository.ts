import { supabase } from '@/lib/supabase'
import { PRIVATE_FILE_BUCKET, privateFileRepository, type AttachmentRow as PrivateAttachmentRow, type PrivateFileBucket } from '@/services/supabase/privateFileRepository'
import type { Database, Json } from '@/types/database.types'

type Tables = Database['public']['Tables']
export type RequestRow = Tables['requests']['Row']
export type RequestHistoryRow = Tables['request_history']['Row']
export type ProjectRow = Tables['projects']['Row']
export type ProjectMemberRow = Tables['project_members']['Row']
export type CompetitionRow = Tables['competitions']['Row']
export type AttachmentRow = PrivateAttachmentRow
export type ProfileRow = Tables['profiles']['Row']
export type EnrollmentRow = Tables['enrollments']['Row']
export type AssignmentRow = Tables['faculty_assignments']['Row']
export type SectionRow = Tables['sections']['Row']
export type RequestType = Database['public']['Enums']['request_type']
export type RequestStatus = Database['public']['Enums']['request_status']

export interface RequestWorkflowData {
  requests: RequestRow[]
  history: RequestHistoryRow[]
  projects: ProjectRow[]
  projectMembers: ProjectMemberRow[]
  competitions: CompetitionRow[]
  attachments: AttachmentRow[]
  profiles: ProfileRow[]
  enrollments: EnrollmentRow[]
  assignments: AssignmentRow[]
  sections: SectionRow[]
}

export interface RequestInput {
  requestType: RequestType
  reason: string
  fromDate: string
  toDate: string
  details: Json
}

export interface ProjectInput {
  id?: string
  name: string
  description: string
  facultyGuideId: string
  status: string
  memberIds: string[]
}

export interface CompetitionInput {
  id?: string
  name: string
  organizer: string
  venue: string
  eventDate: string
  details: Json
}

const activeRequestStatuses: RequestStatus[] = ['draft', 'submitted', 'class_teacher_approved', 'faculty_approved', 'provisional_approved', 'certificate_pending', 'certificate_verified']
const client = () => {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function fail(error: { message: string; code?: string } | null, fallback: string): void {
  if (!error) return
  if (error.code === '23505' || /duplicate|unique/i.test(error.message)) throw new Error('A duplicate active record already exists.')
  if (/row-level|policy|permission|authorized|not allowed/i.test(error.message)) throw new Error('You are not authorized to perform this workflow action.')
  if (/locked|unavailable for transition/i.test(error.message)) throw new Error('This workflow is finalized or locked.')
  if (/invalid request transition/i.test(error.message)) throw new Error('This status transition is not permitted for your role or the current state.')
  throw new Error(error.message || fallback)
}

async function currentContext() {
  const { data: auth, error: authError } = await client().auth.getUser()
  if (authError || !auth.user) throw new Error('Please sign in again to continue.')
  const { data: profile, error } = await client().from('profiles').select('*').eq('id', auth.user.id).maybeSingle()
  fail(error, 'Unable to load your profile.')
  if (!profile?.department_id) throw new Error('A department profile is required for this workflow.')
  return { userId: auth.user.id, profile }
}

async function selectAll<Name extends keyof Tables>(table: Name): Promise<Tables[Name]['Row'][]> {
  const { data, error } = await client().from(table).select('*')
  fail(error, `Unable to load ${table}.`)
  return data as unknown as Tables[Name]['Row'][]
}

function objectDetails(value: Json): Record<string, Json | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

function dateOverlap(fromA: string | null, toA: string | null, fromB: string, toB: string) {
  if (!fromA || !toA) return false
  return fromA <= toB && toA >= fromB
}

async function uploadAttachment(requestId: string, bucket: PrivateFileBucket, file: File, module: string): Promise<AttachmentRow> {
  return privateFileRepository.uploadAndRegisterAttachment({
    entityId: requestId,
    entityType: 'request',
    bucket,
    module,
    file,
  })
}

async function removeAttachment(attachment: AttachmentRow) {
  await privateFileRepository.deleteRegisteredAttachment(attachment)
}

async function transitionRequest(requestId: string, newStatus: RequestStatus, comments?: string): Promise<void> {
  if (['rejected', 'faculty_rejected', 'hod_rejected'].includes(newStatus) && (!comments || comments.trim().length < 3)) throw new Error('Enter a rejection reason with at least three characters.')
  const { data: request, error: requestError } = await client().from('requests').select('request_type').eq('id', requestId).maybeSingle()
  fail(requestError, 'Unable to validate the request transition.')
  if (!request) throw new Error('The request is no longer available.')
  if (request.request_type === 'od') {
    const bucket = ['certificate_verified', 'finalized'].includes(newStatus) ? PRIVATE_FILE_BUCKET.odCertificate : ['faculty_approved', 'provisional_approved'].includes(newStatus) ? PRIVATE_FILE_BUCKET.odProof : null
    if (bucket) {
      const { data: attachment, error } = await client().from('attachments').select('id').eq('entity_id', requestId).eq('bucket_id', bucket).eq('is_active', true).eq('verification_status', 'verified').limit(1)
      fail(error, 'Unable to verify the OD document state.')
      if (!(attachment ?? []).length) throw new Error(`The ${bucket === PRIVATE_FILE_BUCKET.odProof ? 'OD proof' : 'OD certificate'} must complete Faculty and Jury verification first.`)
    }
  }
  const args = comments?.trim()
    ? { p_request_id: requestId, p_new_status: newStatus, p_comments: comments.trim() }
    : { p_request_id: requestId, p_new_status: newStatus }
  const { error } = await client().rpc('transition_request_status', args)
  fail(error, 'Unable to update the request status.')
}

async function validateProjectMembers(memberIds: string[], departmentId: string) {
  if (!memberIds.length) throw new Error('Select at least one active student project member.')
  const uniqueIds = [...new Set(memberIds)]
  if (uniqueIds.length !== memberIds.length) throw new Error('A student cannot be added to the project more than once.')
  const { data: enrollments, error } = await client().from('enrollments').select('student_id,section_id').in('student_id', uniqueIds).eq('status', 'active')
  fail(error, 'Unable to validate project members.')
  const validIds = new Set((enrollments ?? []).map((enrollment) => enrollment.student_id))
  if (uniqueIds.some((id) => !validIds.has(id))) throw new Error('Every project member must have an active enrollment.')
  const { data: sections, error: sectionError } = await client().from('sections').select('id,department_id').in('id', (enrollments ?? []).map((row) => row.section_id))
  fail(sectionError, 'Unable to validate project-member departments.')
  const sectionDepartments = new Map((sections ?? []).map((section) => [section.id, section.department_id]))
  if ((enrollments ?? []).some((row) => sectionDepartments.get(row.section_id) !== departmentId)) throw new Error('Project members must belong to the project department.')
}

export const requestWorkflowRepository = {
  async loadData(): Promise<RequestWorkflowData> {
    const [requests, history, projects, projectMembers, competitions, attachments, profiles, enrollments, assignments, sections] = await Promise.all([
      selectAll('requests'),
      selectAll('request_history'),
      selectAll('projects'),
      selectAll('project_members'),
      selectAll('competitions'),
      selectAll('attachments'),
      selectAll('profiles'),
      selectAll('enrollments'),
      selectAll('faculty_assignments'),
      selectAll('sections'),
    ])
    return { requests, history, projects, projectMembers, competitions, attachments, profiles, enrollments, assignments, sections }
  },

  async createRequest(input: RequestInput, file?: File): Promise<RequestRow> {
    const { userId, profile } = await currentContext()
    if (input.reason.trim().length < 3) throw new Error('Enter a reason with at least three characters.')
    if (!input.fromDate || !input.toDate || input.toDate < input.fromDate) throw new Error('Choose a valid start and end date.')
    if (profile.role === 'student' && !['student_leave', 'gate_pass', 'od'].includes(input.requestType)) throw new Error('Students cannot create this request type.')
    if ((profile.role === 'faculty' || profile.role === 'lab_assistant') && input.requestType !== 'staff_leave') throw new Error('Staff may create only staff leave requests here.')
    const { data: existing, error: existingError } = await client().from('requests').select('*').eq('requester_id', userId).eq('request_type', input.requestType).in('status', activeRequestStatuses)
    fail(existingError, 'Unable to check active requests.')
    if ((existing ?? []).some((row) => dateOverlap(row.from_date, row.to_date, input.fromDate, input.toDate))) throw new Error('An overlapping active request already exists.')

    const details = objectDetails(input.details)
    if ((input.requestType === 'student_leave' || input.requestType === 'staff_leave') && (typeof details.leave_type !== 'string' || !details.leave_type)) throw new Error('Select a leave type.')
    if (input.requestType === 'gate_pass') {
      const exitTime = typeof details.exit_time === 'string' ? details.exit_time : ''
      const returnTime = typeof details.return_time === 'string' ? details.return_time : ''
      if (!details.destination || !exitTime || !returnTime || returnTime <= exitTime) throw new Error('Enter a destination and a valid exit/return time range.')
    }
    if (input.requestType === 'od') {
      if (!details.event_name || typeof details.event_date !== 'string') throw new Error('Enter the OD event name and date.')
      if (details.event_date < input.fromDate || details.event_date > input.toDate) throw new Error('The event date must fall within the requested OD date range.')
      if (!file) throw new Error('Upload the OD proof before submitting.')
    }

    const requestId = crypto.randomUUID()
    let attachment: AttachmentRow | null = null
    let requestCreated = false
    const bucket: PrivateFileBucket | null = file ? input.requestType === 'od' ? PRIVATE_FILE_BUCKET.odProof : input.requestType === 'gate_pass' ? PRIVATE_FILE_BUCKET.gatePass : PRIVATE_FILE_BUCKET.leave : null
    try {
      if (file && bucket) attachment = await uploadAttachment(requestId, bucket, file, `${input.requestType}-request`)
      const { data, error } = await client().from('requests').insert({
        id: requestId,
        requester_id: userId,
        request_type: input.requestType,
        status: 'submitted',
        reason: input.reason.trim(),
        from_date: input.fromDate,
        to_date: input.toDate,
        details: input.details,
      }).select().single()
      fail(error, 'Unable to submit the request.')
      if (!data) throw new Error('Unable to submit the request.')
      requestCreated = true
      const { error: historyError } = await client().from('request_history').insert({
        request_id: data.id,
        actor_id: userId,
        actor_role: profile.role,
        action: 'submitted',
        new_status: 'submitted',
      })
      fail(historyError, 'The request was submitted, but its initial history could not be recorded.')
      return data
    } catch (error) {
      if (attachment && !requestCreated) await removeAttachment(attachment)
      throw error
    }
  },

  async transition(requestId: string, newStatus: RequestStatus, comments?: string): Promise<void> {
    await transitionRequest(requestId, newStatus, comments)
  },

  async uploadOdCertificate(requestId: string, file: File): Promise<void> {
    const { userId } = await currentContext()
    const { data: request, error } = await client().from('requests').select('*').eq('id', requestId).maybeSingle()
    fail(error, 'Unable to load the OD request.')
    if (!request || request.requester_id !== userId || request.request_type !== 'od' || request.status !== 'provisional_approved') throw new Error('This OD request is not ready for certificate upload.')
    const attachment = await uploadAttachment(requestId, PRIVATE_FILE_BUCKET.odCertificate, file, 'od-certificate')
    try {
      await transitionRequest(requestId, 'certificate_pending')
    } catch (transitionError) {
      await removeAttachment(attachment)
      throw transitionError
    }
  },

  async saveProject(input: ProjectInput): Promise<ProjectRow> {
    const { userId, profile } = await currentContext()
    const name = input.name.trim()
    if (!name || input.description.trim().length < 3) throw new Error('Enter a project name and description.')
    if (!['proposed', 'active', 'completed', 'archived'].includes(input.status)) throw new Error('Choose a valid project status.')
    const guideId = profile.role === 'faculty' ? userId : input.facultyGuideId
    if (!guideId) throw new Error('Select an active Faculty Guide.')
    const { data: guideAssignments, error: guideError } = await client().from('faculty_assignments').select('id').eq('faculty_id', guideId).eq('assignment_type', 'faculty_guide').eq('is_active', true).limit(1)
    fail(guideError, 'Unable to validate the Faculty Guide.')
    if (!(guideAssignments ?? []).length) throw new Error('The selected Faculty member has no active Faculty Guide assignment.')
    await validateProjectMembers(input.memberIds, profile.department_id!)
    const query = client().from('projects').select('id').eq('department_id', profile.department_id!).ilike('name', name)
    const { data: duplicate, error: duplicateError } = input.id ? await query.neq('id', input.id) : await query
    fail(duplicateError, 'Unable to check duplicate projects.')
    if ((duplicate ?? []).length) throw new Error('A project with this name already exists in the department.')

    if (input.id) {
      const { data, error } = await client().from('projects').update({
        name,
        description: input.description.trim(),
        faculty_guide_id: guideId,
        status: input.status,
      }).eq('id', input.id).select().single()
      fail(error, 'Unable to update the project.')
      if (!data) throw new Error('Unable to update the project.')
      const { data: existingMembers, error: existingError } = await client().from('project_members').select('student_id').eq('project_id', input.id)
      fail(existingError, 'Unable to load current project members.')
      const existingIds = new Set((existingMembers ?? []).map((member) => member.student_id))
      const removedIds = [...existingIds].filter((studentId) => !input.memberIds.includes(studentId))
      const addedIds = input.memberIds.filter((studentId) => !existingIds.has(studentId))
      if (removedIds.length) {
        const { error: removeError } = await client().from('project_members').delete().eq('project_id', input.id).in('student_id', removedIds)
        fail(removeError, 'Unable to remove project members.')
      }
      if (addedIds.length) {
        const { error: memberError } = await client().from('project_members').insert(addedIds.map((studentId) => ({ project_id: input.id!, student_id: studentId })))
        fail(memberError, 'Unable to add project members.')
      }
      return data
    }

    const { data, error } = await client().from('projects').insert({
      department_id: profile.department_id!,
      faculty_guide_id: guideId,
      name,
      description: input.description.trim(),
      status: input.status,
    }).select().single()
    fail(error, 'Unable to create the project.')
    if (!data) throw new Error('Unable to create the project.')
    const { error: memberError } = await client().from('project_members').insert(input.memberIds.map((studentId) => ({ project_id: data.id, student_id: studentId })))
    fail(memberError, 'The project was created, but its members could not be added.')
    return data
  },

  async removeProjectMember(projectId: string, studentId: string): Promise<void> {
    const { error } = await client().from('project_members').delete().eq('project_id', projectId).eq('student_id', studentId)
    fail(error, 'Unable to remove the project member.')
  },

  async saveCompetition(input: CompetitionInput): Promise<CompetitionRow> {
    const { profile } = await currentContext()
    if (profile.role !== 'super_admin') throw new Error('Only Super Admin can maintain competition records.')
    if (!input.name.trim() || !input.organizer.trim() || !input.eventDate) throw new Error('Enter the competition name, organizer, and event date.')
    const details = objectDetails(input.details)
    const endDate = typeof details.end_date === 'string' ? details.end_date : input.eventDate
    if (endDate < input.eventDate) throw new Error('Competition end date cannot be before its start date.')
    const participantIds = Array.isArray(details.participant_ids) ? details.participant_ids.filter((id): id is string => typeof id === 'string') : []
    if (participantIds.length) await validateProjectMembers(participantIds, profile.department_id!)
    const query = client().from('competitions').select('id').eq('name', input.name.trim()).eq('organizer', input.organizer.trim()).eq('event_date', input.eventDate)
    const { data: duplicate, error: duplicateError } = input.id ? await query.neq('id', input.id) : await query
    fail(duplicateError, 'Unable to check duplicate competitions.')
    if ((duplicate ?? []).length) throw new Error('This competition participation record already exists.')
    const payload = {
      department_id: profile.department_id!,
      name: input.name.trim(),
      organizer: input.organizer.trim(),
      venue: input.venue.trim() || null,
      event_date: input.eventDate,
      details: input.details,
    }
    const result = input.id
      ? await client().from('competitions').update(payload).eq('id', input.id).select().single()
      : await client().from('competitions').insert(payload).select().single()
    fail(result.error, 'Unable to save the competition.')
    if (!result.data) throw new Error('Unable to save the competition.')
    return result.data
  },
}
