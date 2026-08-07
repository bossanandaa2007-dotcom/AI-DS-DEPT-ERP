// Shared helpers for the AI&DS pilot data-load scripts.
// Reads service-role credentials from supabase/.env.ops (gitignored, never VITE_-prefixed).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const OUT = join(HERE, 'out')

function loadEnv() {
  const path = join(HERE, '..', '.env.ops')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`Missing ${path}. It must define SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`)
  }
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at > 0) env[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim()
  }
  for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[name]) throw new Error(`${name} is missing from supabase/.env.ops`)
  }
  if (!/^eyJ|^sb_secret/.test(env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY does not look like a service-role key.')
  }
  return env
}

export const env = loadEnv()

export const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
})

/** Throw on any PostgREST error, with the table name for context. */
export function ok(table, { data, error, count }) {
  if (error) {
    const detail = [error.code, error.message, error.details, error.hint].filter(Boolean).join(' | ')
    throw new Error(`${table}: ${detail}`)
  }
  return count === undefined || count === null ? data : { data, count }
}

/** Select every row of a table, paging past PostgREST's 1000-row default cap. */
export async function selectAll(table, columns = '*') {
  const rows = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const res = await admin.from(table).select(columns).range(from, from + size - 1)
    if (res.error) {
      const detail = [res.error.code, res.error.message].filter(Boolean).join(' | ')
      throw new Error(`select ${table}: ${detail}`)
    }
    rows.push(...res.data)
    if (res.data.length < size) return rows
  }
}

export async function countOf(table) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true })
  if (error) return { error: `${error.code ?? ''} ${error.message}`.trim() }
  return { count: count ?? 0 }
}

/** Every auth.users row, paged. */
export async function listAuthUsers() {
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    users.push(...(data.users ?? []))
    if ((data.users ?? []).length < 1000) return users
  }
}

/**
 * Initial credentials, derived rather than stored, so no file in the repository holds one.
 * Staff: id `divya_aids` -> password `divya@aids`. Student: id is the register number and
 * the password is its last four digits.
 */
export const staffPassword = (userId) => userId.replace(/_aids$/, '@aids')
export const studentPassword = (registerNumber) => registerNumber.slice(-4)

export const TABLES = [
  'departments', 'academic_years', 'semesters', 'sections', 'subjects', 'profiles',
  'enrollments', 'faculty_assignments', 'timetable_entries',
  'attendance_sessions', 'attendance_records', 'attendance_corrections', 'staff_attendance',
  'assessments', 'marks', 'mark_corrections',
  'requests', 'request_history', 'projects', 'project_members', 'competitions', 'attachments',
  'portion_updates', 'announcements', 'announcement_reads', 'complaints', 'messages',
  'notifications', 'audit_logs',
  // Tables the deployed database carries that the migrations here do not create.
  'faculty_teaching_scopes', 'timetable_periods',
]
