import type { PostgrestError } from '@supabase/supabase-js'

export function readableSupabaseError(error: PostgrestError | Error | null) {
  if (!error) return 'Unexpected database error.'
  if ('code' in error && error.code === '23505') return 'A matching record already exists.'
  if ('code' in error && error.code === '23503') return 'A related record no longer exists.'
  if ('code' in error && error.code === '42501') return 'You do not have permission for this action.'
  if ('code' in error && error.code === 'PGRST116') return 'The requested record is unavailable or your session has expired.'
  return error.message
}

export function requiredId(value: string | undefined, label: string) { if (!value) throw new Error(`${label} is required.`); return value }
