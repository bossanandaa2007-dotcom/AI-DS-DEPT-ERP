import type { Json } from '@/types/database.types'

/** Audit payloads are written by database triggers, so never surface credential-shaped keys. */
const blockedKeys = new Set(['password', 'token', 'secret', 'authorization', 'access_token', 'refresh_token'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `jury_reviewer_id` reads as `jury reviewer` once the value is resolved to a name. */
const readableKey = (key: string) => key.replace(/_id$/, '').replaceAll('_', ' ')

/** Resolves a referenced row to a display name, or null when the viewer cannot see it. */
export type ReferenceResolver = (id: string) => string | null

function readableValue(value: Json | undefined, resolve: ReferenceResolver) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value !== 'string') return '[structured data]'
  if (!uuidPattern.test(value)) return value
  // A raw or truncated UUID tells a reader nothing, so an unresolvable reference is named as
  // such. The full id stays in the audit row itself for anyone querying the database.
  return resolve(value) ?? 'unavailable'
}

/**
 * Renders an audit log's metadata as a readable summary, turning record UUIDs into names.
 * Without this an entry reads `jury_reviewer_id: 171ecbb5-2453-46da-86ce-0a0ca6a45402`.
 */
export function formatAuditMetadata(value: Json | null, resolve: ReferenceResolver, options: { limit?: number; empty?: string } = {}) {
  const { limit = 3, empty = 'Recorded action' } = options
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  const fields = Object.entries(value).filter(([key]) => !blockedKeys.has(key.toLowerCase())).slice(0, limit)
  if (!fields.length) return empty
  return fields.map(([key, field]) => `${readableKey(key)}: ${readableValue(field, resolve)}`).join(' · ')
}
