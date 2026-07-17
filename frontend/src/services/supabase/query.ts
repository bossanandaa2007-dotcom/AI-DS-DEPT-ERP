type SupabaseErrorLike = { code?: string; message: string; status?: number; name?: string }

export function readableSupabaseError(error: SupabaseErrorLike | Error | null, resource = 'resource', operation = 'access') {
  if (!error) return `Unexpected ${resource} error.`
  const candidate = error as SupabaseErrorLike
  const context = import.meta.env.DEV ? ` [resource: ${resource}; operation: ${operation}; code: ${candidate.code ?? 'none'}; status: ${candidate.status ?? 'none'}]` : ''
  if (/failed to fetch|network|networkerror|load failed|timeout/i.test(error.message) || candidate.status === 0) return `Unable to connect to Supabase. Check your connection and retry.${context}`
  if (candidate.code === '42501' || candidate.status === 401 || candidate.status === 403 || /policy|permission|not authorized|row-level/i.test(error.message)) return `You are not authorized to access this resource.${context}`
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204'].includes(candidate.code ?? '') || /does not exist|schema cache|column .* not found|function .* not found/i.test(error.message)) return `A database integration required by this page is unavailable.${context}`
  if ('code' in error && error.code === '23505') return 'A matching record already exists.'
  if ('code' in error && error.code === '23503') return 'A related record no longer exists.'
  if ('code' in error && error.code === 'PGRST116') return 'The requested record is unavailable or your session has expired.'
  return `${error.message || `Unable to ${operation} ${resource}.`}${context}`
}

export function requiredId(value: string | undefined, label: string) { if (!value) throw new Error(`${label} is required.`); return value }
