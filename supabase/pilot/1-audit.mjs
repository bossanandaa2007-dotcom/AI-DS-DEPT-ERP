// Read-only audit of the deployed database. Writes nothing. Run before any load.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TABLES, OUT, admin, countOf, listAuthUsers, selectAll } from './lib.mjs'

mkdirSync(OUT, { recursive: true })
const report = []
const say = (line = '') => { report.push(line); console.log(line) }

say('# Deployed database audit')
say(`Generated: ${new Date().toISOString()}`)
say()

say('## Row counts')
say('| Table | Rows |')
say('| --- | ---: |')
const counts = {}
for (const table of TABLES) {
  const result = await countOf(table)
  counts[table] = result
  say(`| ${table} | ${result.error ? '— (' + result.error + ')' : result.count} |`)
}
say()

const nonEmpty = Object.entries(counts).filter(([, r]) => !r.error && r.count > 0).map(([t]) => t)
say(`Non-empty tables: ${nonEmpty.length ? nonEmpty.join(', ') : 'none'}`)
say()

say('## Auth users')
const authUsers = await listAuthUsers()
say(`Total auth.users: ${authUsers.length}`)
say()
say('| Email | Confirmed | Created | Last sign-in |')
say('| --- | --- | --- | --- |')
for (const u of authUsers.slice(0, 60)) {
  say(`| ${u.email ?? '—'} | ${u.email_confirmed_at ? 'yes' : 'no'} | ${(u.created_at ?? '').slice(0, 10)} | ${(u.last_sign_in_at ?? '—').slice(0, 10)} |`)
}
if (authUsers.length > 60) say(`| …${authUsers.length - 60} more | | | |`)
say()

// Academic structure, in full — this is what a demo/real decision hinges on.
for (const table of ['departments', 'academic_years', 'semesters', 'sections', 'subjects']) {
  if (counts[table]?.error || !counts[table]?.count) continue
  const rows = await selectAll(table)
  say(`## ${table} (${rows.length})`)
  say('```')
  for (const row of rows) say(JSON.stringify(row))
  say('```')
  say()
}

if (counts.profiles?.count) {
  const profiles = await selectAll('profiles', 'id, full_name, email, role, status, employee_or_register_number, department_id, section_id, designation')
  say(`## profiles (${profiles.length})`)
  const byRole = {}
  for (const p of profiles) byRole[p.role] = (byRole[p.role] ?? 0) + 1
  say('By role: ' + JSON.stringify(byRole))
  say('```')
  for (const p of profiles) say(JSON.stringify(p))
  say('```')
  say()
}

for (const table of ['faculty_assignments', 'timetable_entries', 'enrollments', 'timetable_periods', 'faculty_teaching_scopes']) {
  if (counts[table]?.error || !counts[table]?.count) continue
  const rows = await selectAll(table)
  say(`## ${table} (${rows.length}) — first 25`)
  say('```')
  for (const row of rows.slice(0, 25)) say(JSON.stringify(row))
  say('```')
  say()
}

// Transactional tables: any rows here mean the pilot database already has real usage.
say('## Transactional data present')
const txn = ['attendance_sessions', 'attendance_records', 'assessments', 'marks', 'requests',
  'announcements', 'complaints', 'messages', 'notifications', 'audit_logs', 'portion_updates',
  'projects', 'competitions', 'attachments', 'staff_attendance']
for (const t of txn) {
  const c = counts[t]
  if (!c?.error && c?.count > 0) say(`- **${t}: ${c.count} rows** — would be destroyed by a purge`)
}
say()

// Probe the columns the README calls schema drift, so the loader knows what to fill.
say('## Column probe (schema drift check)')
for (const [table, cols] of Object.entries({
  subjects: ['subject_type', 'weekly_hours', 'is_active', 'study_year'],
  sections: ['batch', 'is_active'],
  profiles: ['date_of_birth', 'employment_type', 'joining_date'],
  faculty_assignments: ['effective_from', 'effective_to', 'weekly_hours', 'is_jury_eligible'],
  timetable_entries: ['academic_year_id', 'department_id', 'semester_id', 'timetable_period_id',
    'allocation_id', 'effective_from', 'effective_to', 'is_active'],
})) {
  for (const col of cols) {
    const { error } = await admin.from(table).select(col).limit(1)
    say(`- ${table}.${col}: ${error ? 'ABSENT (' + error.code + ')' : 'present'}`)
  }
}

writeFileSync(join(OUT, 'audit.md'), report.join('\n') + '\n', 'utf8')
console.log(`\nWritten to ${join(OUT, 'audit.md')}`)
