// Removes the demo/test data so the real AI&DS pilot data can be loaded.
//
// DESTRUCTIVE. Requires --confirm. Without it, this prints exactly what it would delete
// and exits without touching anything.
//
//   node supabase/pilot/2-purge.mjs            # dry run
//   node supabase/pilot/2-purge.mjs --confirm  # actually delete
//
// The department and academic-year rows are KEPT and reused, as is the super-admin account
// named in KEEP_EMAILS — deleting the only super_admin would lock everyone out.
import { admin, listAuthUsers, countOf } from './lib.mjs'

const CONFIRM = process.argv.includes('--confirm')
const KEEP_EMAILS = new Set(['admin@vernex.in'])
const NIL = '00000000-0000-0000-0000-000000000000'

// Children before parents. Every table here is demo data; the real load recreates it.
const DELETE_ORDER = [
  'attendance_corrections', 'attendance_records', 'attendance_sessions',
  'mark_corrections', 'marks', 'assessments',
  'announcement_reads', 'announcements',
  'request_history', 'attachments', 'requests',
  'project_members', 'projects', 'competitions',
  'portion_updates', 'complaints', 'messages', 'notifications',
  'staff_attendance',
  // audit_logs is deliberately NOT purged: an append-only trigger rejects DELETE, and that
  // control is worth more than a clean row count. The demo-era entries stay, with their
  // actor_id set to null once the demo profiles go.
  'timetable_entries', 'faculty_teaching_scopes', 'faculty_assignments', 'enrollments',
  // profiles are removed by deleting their auth user (profiles.id cascades from auth.users)
  'subjects', 'sections', 'semesters', 'timetable_periods',
]

console.log(CONFIRM ? '=== PURGE (LIVE) ===' : '=== PURGE (DRY RUN — nothing will be deleted) ===')
console.log()

const before = {}
for (const table of DELETE_ORDER) {
  const r = await countOf(table)
  before[table] = r.error ? `error: ${r.error}` : r.count
}
const authUsers = await listAuthUsers()
const toDelete = authUsers.filter((u) => !KEEP_EMAILS.has((u.email ?? '').toLowerCase()))
const toKeep = authUsers.filter((u) => KEEP_EMAILS.has((u.email ?? '').toLowerCase()))

console.log('Rows that will be deleted:')
let total = 0
for (const table of DELETE_ORDER) {
  const n = before[table]
  if (typeof n === 'number' && n > 0) { console.log(`  ${table.padEnd(26)} ${n}`); total += n }
  else if (typeof n !== 'number') console.log(`  ${table.padEnd(26)} ${n}`)
}
console.log(`  ${'(total table rows)'.padEnd(26)} ${total}`)
console.log()
console.log(`Auth accounts that will be deleted (${toDelete.length}):`)
for (const u of toDelete) console.log(`  - ${u.email}`)
console.log(`Auth accounts kept (${toKeep.length}):`)
for (const u of toKeep) console.log(`  + ${u.email}`)
console.log()
console.log('Kept and reused: departments, academic_years')
console.log()

if (!CONFIRM) {
  console.log('Dry run only. Re-run with --confirm to apply.')
  process.exit(0)
}

// `attendance_records_finalized_guard` raises on DELETE while the parent session is
// finalized or locked, so those sessions are reopened first. This only ever runs against
// demo rows — the guard stays fully in force for the real pilot data loaded afterwards.
console.log('Reopening finalized attendance sessions so their records can be removed…')
{
  const { data: sessions, error } = await admin.from('attendance_sessions')
    .select('id, status').in('status', ['finalized', 'locked'])
  if (error) { console.error(`  FAILED reading sessions: ${error.message}`); process.exit(1) }
  if (sessions.length) {
    const { error: updateError } = await admin.from('attendance_sessions')
      .update({ status: 'draft', finalized_by: null, finalized_at: null })
      .in('id', sessions.map((s) => s.id))
    if (updateError) { console.error(`  FAILED reopening: ${updateError.message}`); process.exit(1) }
  }
  console.log(`  reopened ${sessions.length} session(s)`)
}

// PostgREST refuses an unfiltered DELETE, so each table needs a filter that matches every
// row. Not every table has an `id` column (project_members has a composite key), so the
// filter column is taken from a sample row.
async function deleteAll(table) {
  const { data: sample, error: sampleError } = await admin.from(table).select('*').limit(1)
  if (sampleError) return { error: sampleError }
  const columns = Object.keys(sample[0] ?? {})
  if (columns.includes('id')) return admin.from(table).delete().neq('id', NIL)
  const column = columns.find((c) => c.endsWith('_id')) ?? columns[0]
  if (!column) return { error: { code: 'NOCOL', message: `no usable filter column on ${table}` } }
  return admin.from(table).delete().not(column, 'is', null)
}

console.log()
console.log('Deleting…')
for (const table of DELETE_ORDER) {
  if (typeof before[table] !== 'number' || before[table] === 0) continue
  const { error } = await deleteAll(table)
  if (error) {
    console.error(`FAILED on ${table}: ${error.code ?? ''} ${error.message}`)
    console.error('Stopped. Nothing further was deleted.')
    process.exit(1)
  }
  const after = await countOf(table)
  console.log(`  ${table.padEnd(26)} ${before[table]} -> ${after.count}`)
}

console.log()
console.log('Deleting auth accounts (profiles cascade)…')
// A profile that appears as audit_logs.actor_id cannot be deleted: the FK is ON DELETE SET
// NULL, and audit_logs carries an append-only trigger that rejects the resulting UPDATE.
// Those accounts are disabled in place instead — the audit trail keeps its actor references.
const blocked = []
let removed = 0
for (const user of toDelete) {
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (!error) { removed += 1; continue }
  blocked.push(user)
  console.log(`  kept  ${user.email} — referenced by the append-only audit log`)
}
console.log(`  removed ${removed} accounts`)

if (blocked.length) {
  console.log()
  console.log('Disabling the demo accounts that could not be deleted…')
  for (const user of blocked) {
    const { error: banError } = await admin.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })
    if (banError) console.error(`  WARNING could not ban ${user.email}: ${banError.message}`)
    const { error: profileError } = await admin.from('profiles')
      .update({ status: 'inactive', full_name: `[retired demo] ${user.email.split('@')[0]}` })
      .eq('id', user.id)
    if (profileError) console.error(`  WARNING could not deactivate ${user.email}: ${profileError.message}`)
    else console.log(`  disabled ${user.email} (banned, status inactive)`)
  }
}

const profiles = await countOf('profiles')
console.log()
console.log(`Remaining profiles: ${profiles.count}`)
console.log('Purge complete.')
