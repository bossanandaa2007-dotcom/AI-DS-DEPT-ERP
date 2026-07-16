import { supabase } from '@/lib/supabase'
import { privateFileRepository, type AttachmentHistoryItem, type AttachmentRow } from '@/services/supabase/privateFileRepository'
import type { Database } from '@/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type ReviewDecision = Database['public']['Enums']['attachment_review_decision']

export interface ReviewPerson { id: string; name: string; registrationNumber: string | null }
export interface ReviewAttachment extends AttachmentRow {
  owner: ReviewPerson | null
  facultyReviewer: ReviewPerson | null
  juryReviewer: ReviewPerson | null
}
export interface EligibleReviewer extends ReviewPerson { isJuryEligible: boolean }
const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }

function readableError(reason: unknown, fallback: string) {
  const message = reason instanceof Error ? reason.message : fallback
  if (/jwt|not authenticated|authentication/i.test(message)) return 'Please sign in again to continue.'
  if (/permission|policy|row-level|not authorized/i.test(message)) return 'You are not authorized to perform this document action.'
  if (/not found/i.test(message)) return 'The document is no longer available.'
  return message || fallback
}

async function currentUserId() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new Error('Please sign in to access document reviews.')
  return data.user.id
}

function person(row: Profile): ReviewPerson { return { id: row.id, name: row.full_name, registrationNumber: row.employee_or_register_number } }

async function attachPeople(rows: AttachmentRow[]): Promise<ReviewAttachment[]> {
  if (!rows.length) return []
  const ids = [...new Set(rows.flatMap((row) => [row.owner_id, row.faculty_reviewer_id, row.jury_reviewer_id]).filter((id): id is string => Boolean(id)))]
  const { data, error } = await client().from('profiles').select('id,full_name,employee_or_register_number').in('id', ids)
  if (error) throw new Error(readableError(error, 'Unable to load document owner details.'))
  const people = new Map((data ?? []).map((row) => [row.id, person(row as Profile)]))
  return rows.map((row) => ({ ...row, owner: people.get(row.owner_id) ?? null, facultyReviewer: row.faculty_reviewer_id ? people.get(row.faculty_reviewer_id) ?? null : null, juryReviewer: row.jury_reviewer_id ? people.get(row.jury_reviewer_id) ?? null : null }))
}

async function readAttachments(stage: 'faculty' | 'jury' | 'student' | 'assignment'): Promise<ReviewAttachment[]> {
  const db = client()
  let query = db.from('attachments').select('*').order('created_at', { ascending: false })
  if (stage === 'faculty') query = query.eq('verification_status', 'pending_faculty_review')
  if (stage === 'jury') query = query.eq('verification_status', 'pending_jury_review').eq('requires_jury_review', true)
  if (stage === 'assignment') query = query.eq('verification_status', 'pending_faculty_review').eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error(readableError(error, 'Unable to load the document queue.'))
  return attachPeople(data ?? [])
}

async function runRpc<Name extends 'assign_attachment_reviewers' | 'review_attachment_as_faculty' | 'review_attachment_as_jury' | 'register_attachment_replacement'>(name: Name, args: Database['public']['Functions'][Name]['Args']) {
  const { error } = await client().rpc(name, args)
  if (error) throw new Error(readableError(error, 'The document workflow could not be updated.'))
}

export const documentReviewRepository = {
  getFacultyReviewQueue: () => readAttachments('faculty'),
  getJuryReviewQueue: () => readAttachments('jury'),
  getStudentAttachments: () => readAttachments('student'),
  getAssignmentQueue: () => readAttachments('assignment'),
  async getAttachmentById(attachmentId: string): Promise<ReviewAttachment> {
    const { data, error } = await client().from('attachments').select('*').eq('id', attachmentId).maybeSingle()
    if (error) throw new Error(readableError(error, 'Unable to load this document.'))
    if (!data) throw new Error('The document is no longer available.')
    const [attachment] = await attachPeople([data])
    return attachment
  },
  async getAttachmentReviewHistory(attachmentId: string): Promise<AttachmentHistoryItem[]> {
    return privateFileRepository.getAttachmentHistory(attachmentId)
  },
  async getEligibleReviewers(): Promise<EligibleReviewer[]> {
    const { data: profiles, error: profilesError } = await client().from('profiles').select('*').eq('role', 'faculty').eq('status', 'active').order('full_name')
    if (profilesError) throw new Error(readableError(profilesError, 'Unable to load active Faculty reviewers.'))
    const { data: assignments, error: assignmentError } = await client().from('faculty_assignments').select('faculty_id,is_active,is_jury_eligible').eq('is_active', true)
    if (assignmentError) throw new Error(readableError(assignmentError, 'Unable to load Faculty eligibility.'))
    const juryIds = new Set((assignments ?? []).filter((assignment) => assignment.is_jury_eligible).map((assignment) => assignment.faculty_id))
    return (profiles ?? []).map((row) => ({ ...person(row), isJuryEligible: juryIds.has(row.id) }))
  },
  async isCurrentUserJuryEligible() {
    const userId = await currentUserId()
    const { data, error } = await client().from('faculty_assignments').select('id').eq('faculty_id', userId).eq('is_active', true).eq('is_jury_eligible', true).limit(1)
    if (error) throw new Error(readableError(error, 'Unable to verify Jury eligibility.'))
    return (data ?? []).length > 0
  },
  assignReviewers: (attachmentId: string, facultyReviewerId: string, juryReviewerId?: string) => runRpc('assign_attachment_reviewers', juryReviewerId ? { p_attachment_id: attachmentId, p_faculty_reviewer_id: facultyReviewerId, p_jury_reviewer_id: juryReviewerId } : { p_attachment_id: attachmentId, p_faculty_reviewer_id: facultyReviewerId }),
  reviewAsFaculty: (attachmentId: string, decision: ReviewDecision, comments?: string) => runRpc('review_attachment_as_faculty', comments?.trim() ? { p_attachment_id: attachmentId, p_decision: decision, p_comments: comments.trim() } : { p_attachment_id: attachmentId, p_decision: decision }),
  reviewAsJury: (attachmentId: string, decision: ReviewDecision, comments?: string) => runRpc('review_attachment_as_jury', comments?.trim() ? { p_attachment_id: attachmentId, p_decision: decision, p_comments: comments.trim() } : { p_attachment_id: attachmentId, p_decision: decision }),
  async uploadReplacementAttachment(original: ReviewAttachment, file: File, onProgress?: (percent: number) => void) {
    try {
      await privateFileRepository.replaceAttachment(original, file, onProgress)
    } catch (error) {
      throw new Error(readableError(error, 'Unable to submit the replacement document.'), { cause: error })
    }
  },
}
