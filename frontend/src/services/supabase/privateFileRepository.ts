import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

type Tables = Database['public']['Tables']
export type AttachmentRow = Tables['attachments']['Row']
export type AttachmentInsert = Tables['attachments']['Insert']
export type AttachmentEntity = Database['public']['Enums']['attachment_entity']
export type AttachmentHistoryItem = { id: string; action: string; createdAt: string; comment: string | null }

export const PRIVATE_FILE_BUCKET = {
  leave: 'leave-documents',
  gatePass: 'gate-pass-documents',
  odProof: 'od-proofs',
  odCertificate: 'od-certificates',
  complaint: 'complaint-attachments',
  announcement: 'announcement-attachments',
} as const
export const PRIVATE_FILE_BUCKETS = [PRIVATE_FILE_BUCKET.leave, PRIVATE_FILE_BUCKET.gatePass, PRIVATE_FILE_BUCKET.odProof, PRIVATE_FILE_BUCKET.odCertificate, PRIVATE_FILE_BUCKET.complaint, PRIVATE_FILE_BUCKET.announcement] as const
export type PrivateFileBucket = typeof PRIVATE_FILE_BUCKETS[number]
export const PRIVATE_FILE_MAX_BYTES = 1_048_576
export const PRIVATE_FILE_SIGNED_URL_SECONDS = 300
export const PRIVATE_FILE_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export type PrivateFileMimeType = typeof PRIVATE_FILE_MIME_TYPES[number]

const bucketSet = new Set<string>(PRIVATE_FILE_BUCKETS)
const mimeSet = new Set<string>(PRIVATE_FILE_MIME_TYPES)
const extensionMime: Record<string, PrivateFileMimeType> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}
const client = () => {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function readableError(reason: unknown, fallback: string) {
  const message = reason instanceof Error ? reason.message : fallback
  if (/jwt|not authenticated|authentication/i.test(message)) return 'Please sign in again to continue.'
  if (/permission|policy|row-level|not authorized/i.test(message)) return 'You are not authorized to access this private file.'
  if (/not found|does not exist|no such object/i.test(message)) return 'The private file is missing or no longer available.'
  if (/duplicate|unique/i.test(message)) return 'This file has already been registered.'
  return message || fallback
}

function assertBucket(bucket: string): asserts bucket is PrivateFileBucket {
  if (!bucketSet.has(bucket)) throw new Error('This Storage bucket is not approved for private files.')
}

async function currentOwner() {
  const { data: auth, error: authError } = await client().auth.getUser()
  if (authError || !auth.user) throw new Error('Please sign in again to upload a private file.')
  const { data: profile, error } = await client().from('profiles').select('department_id').eq('id', auth.user.id).maybeSingle()
  if (error) throw new Error(readableError(error, 'Unable to load the file owner profile.'))
  if (!profile?.department_id) throw new Error('A department profile is required to upload private files.')
  return { ownerId: auth.user.id, departmentId: profile.department_id }
}

export function validatePrivateFile(file: Pick<File, 'name' | 'size' | 'type'>): asserts file is File & { type: PrivateFileMimeType } {
  const extension = file.name.toLowerCase().split('.').pop() ?? ''
  const expected = extensionMime[extension]
  if (!expected || !mimeSet.has(file.type) || file.type !== expected) throw new Error('Unsupported file. Upload PDF, JPEG, JPG, or PNG only.')
  if (file.size <= 0) throw new Error('The selected file is empty.')
  if (file.size > PRIVATE_FILE_MAX_BYTES) throw new Error('Maximum allowed file size is exactly 1 MB (1,048,576 bytes).')
}

export function sanitizePrivateFilename(name: string) {
  const extension = name.toLowerCase().match(/\.(pdf|jpe?g|png)$/)?.[0] ?? ''
  const stem = name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').slice(0, 80) || 'document'
  return `${stem}${extension}`
}

export function createPrivateObjectPath(departmentId: string, ownerId: string, module: string, attachmentId: string, filename: string) {
  for (const value of [departmentId, ownerId, module, attachmentId]) if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid private-file path identifier.')
  return `${departmentId}/${ownerId}/${module}/${attachmentId}/${sanitizePrivateFilename(filename)}`
}

export async function uploadPrivateFile(bucket: PrivateFileBucket, objectPath: string, file: File, onProgress?: (percent: number) => void) {
  validatePrivateFile(file)
  onProgress?.(0)
  const { error } = await client().storage.from(bucket).upload(objectPath, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(readableError(error, 'Unable to upload the private file.'))
  onProgress?.(100)
  return { bucket, objectPath, filename: sanitizePrivateFilename(file.name), mimeType: file.type, sizeBytes: file.size }
}

export async function createAttachmentMetadata(input: AttachmentInsert): Promise<AttachmentRow> {
  assertBucket(input.bucket_id)
  const { data, error } = await client().from('attachments').insert(input).select().single()
  if (error) throw new Error(readableError(error, 'Unable to register attachment metadata.'))
  if (!data) throw new Error('Unable to register attachment metadata.')
  return data
}

export async function deleteFailedStorageObject(bucket: PrivateFileBucket, objectPath: string): Promise<void> {
  const { error } = await client().storage.from(bucket).remove([objectPath])
  if (error && !/not found|does not exist/i.test(error.message)) throw new Error(readableError(error, 'Unable to clean up the failed private upload.'))
}

export async function deleteRegisteredAttachment(attachment: AttachmentRow): Promise<void> {
  assertBucket(attachment.bucket_id)
  const { error } = await client().from('attachments').delete().eq('id', attachment.id)
  if (error) throw new Error(readableError(error, 'Unable to remove failed attachment metadata.'))
  await deleteFailedStorageObject(attachment.bucket_id, attachment.object_path)
}

export interface UploadAndRegisterInput {
  entityId: string
  entityType: AttachmentEntity
  bucket: PrivateFileBucket
  module: string
  file: File
  preventDuplicateActive?: boolean
  onProgress?: (percent: number) => void
}

export async function uploadAndRegisterAttachment(input: UploadAndRegisterInput): Promise<AttachmentRow> {
  const { ownerId, departmentId } = await currentOwner()
  if (input.preventDuplicateActive !== false) {
    const { data, error } = await client().from('attachments').select('id').eq('owner_id', ownerId).eq('entity_type', input.entityType).eq('entity_id', input.entityId).eq('bucket_id', input.bucket).eq('is_active', true).limit(1)
    if (error) throw new Error(readableError(error, 'Unable to check existing private files.'))
    if ((data ?? []).length) throw new Error('An active file is already registered for this record and document type.')
  }
  const attachmentId = crypto.randomUUID()
  const objectPath = createPrivateObjectPath(departmentId, ownerId, input.module, attachmentId, input.file.name)
  let metadataCreated = false
  try {
    const uploaded = await uploadPrivateFile(input.bucket, objectPath, input.file, input.onProgress)
    const attachment = await createAttachmentMetadata({
      id: attachmentId,
      owner_id: ownerId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      bucket_id: uploaded.bucket,
      object_path: uploaded.objectPath,
      filename: uploaded.filename,
      mime_type: uploaded.mimeType,
      size_bytes: uploaded.sizeBytes,
    })
    metadataCreated = true
    return attachment
  } catch (error) {
    if (metadataCreated) await client().from('attachments').delete().eq('id', attachmentId)
    await deleteFailedStorageObject(input.bucket, objectPath).catch(() => undefined)
    throw error
  }
}

export async function createPrivateSignedUrl(attachment: Pick<AttachmentRow, 'bucket_id' | 'object_path'>): Promise<string> {
  assertBucket(attachment.bucket_id)
  const { data, error } = await client().storage.from(attachment.bucket_id).createSignedUrl(attachment.object_path, PRIVATE_FILE_SIGNED_URL_SECONDS)
  if (error) throw new Error(readableError(error, 'Unable to create a secure file preview.'))
  return data.signedUrl
}

export async function replaceAttachment(original: AttachmentRow, file: File, onProgress?: (percent: number) => void): Promise<AttachmentRow> {
  const { ownerId } = await currentOwner()
  if (original.owner_id !== ownerId) throw new Error('Only the document owner can replace this file.')
  if (!original.is_active || !['faculty_rejected', 'jury_rejected'].includes(original.verification_status)) throw new Error('Only an active rejected document can be replaced.')
  assertBucket(original.bucket_id)
  const { data: existing, error: existingError } = await client().from('attachments').select('id').eq('replacement_for_attachment_id', original.id).eq('is_active', true).limit(1)
  if (existingError) throw new Error(readableError(existingError, 'Unable to check replacement history.'))
  if ((existing ?? []).length) throw new Error('A replacement has already been submitted for this document.')

  const replacement = await uploadAndRegisterAttachment({
    entityId: original.entity_id,
    entityType: original.entity_type,
    bucket: original.bucket_id,
    module: `replacement-${original.entity_id}`,
    file,
    preventDuplicateActive: false,
    onProgress,
  })
  try {
    const { error } = await client().rpc('register_attachment_replacement', {
      p_original_attachment_id: original.id,
      p_replacement_attachment_id: replacement.id,
    })
    if (error) throw new Error(readableError(error, 'Unable to register the replacement document.'))
    return replacement
  } catch (error) {
    await client().from('attachments').delete().eq('id', replacement.id)
    await deleteFailedStorageObject(original.bucket_id, replacement.object_path).catch(() => undefined)
    throw error
  }
}

export async function getAttachmentHistory(attachmentId: string): Promise<AttachmentHistoryItem[]> {
  const { data, error } = await client().from('audit_logs').select('id,action,created_at,after_data').eq('module', 'attachments').eq('record_reference', attachmentId).order('created_at', { ascending: true })
  if (error) throw new Error(readableError(error, 'Unable to load attachment history.'))
  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    createdAt: row.created_at,
    comment: typeof row.after_data === 'object' && row.after_data !== null && 'comments' in row.after_data && typeof row.after_data.comments === 'string' ? row.after_data.comments : null,
  }))
}

export const privateFileRepository = {
  validatePrivateFile,
  uploadPrivateFile,
  createAttachmentMetadata,
  uploadAndRegisterAttachment,
  createPrivateSignedUrl,
  deleteFailedStorageObject,
  deleteRegisteredAttachment,
  replaceAttachment,
  getAttachmentHistory,
}
