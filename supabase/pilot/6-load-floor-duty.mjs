// Loads the floor duty roster into public.floor_duties and retires the announcement that
// carried it as a block of prose.
//
// Requires supabase/migrations/202608060112_floor_duties.sql to have been applied.
//
//   node supabase/pilot/6-load-floor-duty.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HERE, admin, ok, selectAll } from './lib.mjs'

const data = JSON.parse(readFileSync(join(HERE, 'pilot-data.json'), 'utf8'))
const { meta } = data

const probe = await admin.from('floor_duties').select('id').limit(1)
if (probe.error) {
  console.error(`public.floor_duties is not available: ${probe.error.code ?? ''} ${probe.error.message}`)
  console.error('Apply supabase/migrations/202608060112_floor_duties.sql first.')
  process.exit(1)
}

const departments = await selectAll('departments')
const department = departments.find((d) => d.code === meta.department_code)
if (!department) throw new Error(`No department with code ${meta.department_code}.`)
const years = await selectAll('academic_years')
const year = years.find((y) => y.department_id === department.id && y.name === meta.academic_year)
if (!year) throw new Error(`No academic year ${meta.academic_year}.`)

const profiles = await selectAll('profiles', 'id, full_name, email')
const idFor = (key) => {
  const person = data.faculty.find((f) => f.key === key)
  if (!person) throw new Error(`unknown faculty key ${key}`)
  const email = `${person.user_id}@${meta.email_domain}`.toLowerCase()
  const profile = profiles.find((p) => (p.email ?? '').toLowerCase() === email)
  if (!profile) throw new Error(`no profile for ${email}`)
  return profile.id
}

const existing = await selectAll('floor_duties')
let created = 0, updated = 0
for (const duty of data.floor_duty) {
  const row = {
    department_id: department.id,
    academic_year_id: year.id,
    faculty_id: idFor(duty.faculty),
    day_of_week: duty.day_of_week,
    shift: duty.shift,
    starts_at: duty.starts_at,
    ends_at: duty.ends_at,
    display_order: duty.display_order,
    is_active: true,
  }
  const match = existing.find((e) => e.academic_year_id === year.id
    && e.day_of_week === row.day_of_week && e.shift === row.shift)
  if (match) { ok('floor_duties', await admin.from('floor_duties').update(row).eq('id', match.id)); updated += 1 }
  else { ok('floor_duties', await admin.from('floor_duties').insert(row)); created += 1 }
}
console.log(`floor_duties: ${created} created, ${updated} updated`)

// The announcement is superseded by the table; leaving it would duplicate the roster and keep
// showing the wall of text it was criticised for.
const announcements = await selectAll('announcements')
const stale = announcements.filter((a) => a.title.startsWith('Floor Duty Roster'))
for (const row of stale) {
  await admin.from('announcement_reads').delete().eq('announcement_id', row.id)
  const { error } = await admin.from('announcements').delete().eq('id', row.id)
  if (error) console.error(`  could not remove announcement "${row.title}": ${error.message}`)
  else console.log(`  retired announcement: ${row.title}`)
}

// Report what each person will now see.
const loaded = await selectAll('floor_duties')
const nameOf = (id) => profiles.find((p) => p.id === id)?.full_name ?? id
const byFaculty = new Map()
for (const duty of loaded) byFaculty.set(duty.faculty_id, (byFaculty.get(duty.faculty_id) ?? 0) + 1)
console.log(`\ntotal rows: ${loaded.length}`)
for (const [id, count] of [...byFaculty.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${nameOf(id).padEnd(28)} ${count} duty slot(s)`)
}
