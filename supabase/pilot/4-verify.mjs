// Verifies the loaded pilot data against pilot-data.json and against the schema's own rules.
// Read-only. Exits non-zero if any check fails.
//
//   node supabase/pilot/4-verify.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs'
import { HERE, OUT, env, selectAll, listAuthUsers, staffPassword, studentPassword } from './lib.mjs'

const data = JSON.parse(readFileSync(join(HERE, 'pilot-data.json'), 'utf8'))
mkdirSync(OUT, { recursive: true })
const report = []
let failures = 0
const say = (line = '') => { report.push(line); console.log(line) }
const check = (label, actual, expected) => {
  const good = actual === expected
  if (!good) failures += 1
  say(`  ${good ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${actual}${good ? '' : ` (expected ${expected})`}`)
}
const note = (label, value) => say(`  ----  ${label.padEnd(52)} ${value}`)

say('# Pilot data verification')
say(`Generated: ${new Date().toISOString()}`)
say()

const [departments, years, semesters, sections, subjects, profiles, enrollments, assignments, timetable, periods, announcements] =
  await Promise.all(['departments', 'academic_years', 'semesters', 'sections', 'subjects', 'profiles',
    'enrollments', 'faculty_assignments', 'timetable_entries', 'timetable_periods', 'announcements'].map((t) => selectAll(t)))

const department = departments.find((d) => d.code === data.meta.department_code)
const year = years.find((y) => y.department_id === department.id && y.name === data.meta.academic_year)
const secById = new Map(sections.map((s) => [s.id, s]))
const subById = new Map(subjects.map((s) => [s.id, s]))
const profById = new Map(profiles.map((p) => [p.id, p]))
const ROMAN = { 2: 'II', 3: 'III', 4: 'IV' }

say('## Structure')
check('departments', departments.length, 1)
check('academic years', years.length, 1)
check('active academic year', year.is_active, true)
check('semesters', semesters.length, data.semesters.length)
check('sections', sections.length, data.sections.length)
check('subjects', subjects.length, data.subjects.length)
check('teaching periods', periods.filter((p) => p.period_type === 'teaching').length, 7)
check('break periods', periods.filter((p) => p.period_type !== 'teaching').length, 2)
say()

say('## Period timings')
for (const p of data.periods) {
  const row = periods.find((r) => r.period_number === p.period)
  const actual = row ? `${row.starts_at.slice(0, 5)}-${row.ends_at.slice(0, 5)}` : 'missing'
  check(`P${p.period}`, actual, `${p.starts_at}-${p.ends_at}`)
}
say()

say('## People')
const students = profiles.filter((p) => p.role === 'student')
const faculty = profiles.filter((p) => ['faculty', 'hod'].includes(p.role) && p.status === 'active')
const retired = profiles.filter((p) => p.status !== 'active')
check('active students', students.filter((p) => p.status === 'active').length, data.students.filter((s) => s.user_id).length)
check('active faculty + hod', faculty.length, data.faculty.length)
check('exactly one HOD', profiles.filter((p) => p.role === 'hod' && p.status === 'active').length, 1)
check('super admins', profiles.filter((p) => p.role === 'super_admin' && p.status === 'active').length, 1)
note('retired/disabled demo profiles', retired.map((p) => p.email).join(', ') || 'none')
check('students with a section', students.filter((p) => p.status === 'active' && p.section_id).length, data.students.filter((s) => s.user_id).length)
check('students with a register number', students.filter((p) => p.status === 'active' && p.employee_or_register_number).length, data.students.filter((s) => s.user_id).length)
check('enrollments', enrollments.length, data.students.filter((s) => s.user_id).length)
say()

say('## Class strength')
for (const s of data.sections) {
  const section = sections.find((r) => r.year_number === Number(Object.entries(ROMAN).find(([, v]) => v === s.year)[0]) && r.name === s.section)
  const expected = data.students.filter((x) => x.year === s.year && x.section === s.section && x.user_id).length
  check(`${s.year}-${s.section} enrolled`, enrollments.filter((e) => e.section_id === section.id).length, expected)
}
say()

say('## Timetable')
check('timetable entries', timetable.length, data.timetable.length)
for (const s of data.sections) {
  const section = sections.find((r) => r.year_number === Number(Object.entries(ROMAN).find(([, v]) => v === s.year)[0]) && r.name === s.section)
  const rows = timetable.filter((t) => t.section_id === section.id)
  const slots = new Set(rows.map((t) => `${t.day_of_week}:${t.period}`))
  check(`${s.year}-${s.section} distinct slots`, slots.size, 35)
  check(`${s.year}-${s.section} rows`, rows.length, data.timetable.filter((t) => t.year === s.year && t.section === s.section).length)
}
check('entries with a faculty assigned', timetable.filter((t) => t.faculty_id).length, data.timetable.length)
check('entries with academic context set', timetable.filter((t) => t.academic_year_id && t.department_id && t.semester_id).length, data.timetable.length)
check('entries linked to a period row', timetable.filter((t) => t.timetable_period_id).length, data.timetable.length)
check('lab-room entries', timetable.filter((t) => t.lab).length, data.timetable.filter((t) => t.lab).length)
const outsideWeek = timetable.filter((t) => t.day_of_week < 1 || t.day_of_week > 5)
check('entries outside Mon-Fri', outsideWeek.length, 0)
say()

say('## Timetable vs source, slot by slot')
{
  let mismatches = 0
  for (const t of data.timetable) {
    const section = sections.find((r) => r.year_number === Number(Object.entries(ROMAN).find(([, v]) => v === t.year)[0]) && r.name === t.section)
    const subject = subjects.find((s) => s.code === t.code && s.semester_id === section.semester_id)
    const row = timetable.find((r) => r.section_id === section.id && r.day_of_week === t.day_of_week
      && r.period === t.period && r.subject_id === subject?.id)
    if (!row) { mismatches += 1; say(`  FAIL  missing ${t.year}-${t.section} day ${t.day_of_week} P${t.period} ${t.code}`); continue }
    const expectedFaculty = data.faculty.find((f) => f.key === t.faculty)
    const actualFaculty = profById.get(row.faculty_id)
    if (expectedFaculty && actualFaculty?.full_name !== expectedFaculty.name) {
      mismatches += 1
      say(`  FAIL  ${t.year}-${t.section} d${t.day_of_week} P${t.period} ${t.code}: faculty is ${actualFaculty?.full_name}, expected ${expectedFaculty.name}`)
    }
    if (row.starts_at.slice(0, 5) !== t.starts_at || row.ends_at.slice(0, 5) !== t.ends_at) {
      mismatches += 1
      say(`  FAIL  ${t.year}-${t.section} d${t.day_of_week} P${t.period} ${t.code}: time is ${row.starts_at}-${row.ends_at}`)
    }
  }
  check('slot-by-slot mismatches', mismatches, 0)
}
say()

say('## Allocations')
check('faculty assignments', assignments.length, data.assignments.length)
check('active assignments', assignments.filter((a) => a.is_active).length, data.assignments.length)
check('class teachers', assignments.filter((a) => a.assignment_type === 'class_teacher').length, 4)
for (const [key, expected] of Object.entries({ 'II-A': 'krithikaa', 'II-B': 'ramani', 'III-A': 'sridevi', 'IV-A': 'jasminepaul' })) {
  const [roman, name] = key.split('-')
  const section = sections.find((r) => ROMAN[r.year_number] === roman && r.name === name)
  const ct = assignments.find((a) => a.section_id === section.id && a.assignment_type === 'class_teacher' && a.is_active)
  const expectedName = data.faculty.find((f) => f.key === expected).name
  check(`class teacher ${key}`, profById.get(ct?.faculty_id)?.full_name ?? 'none', expectedName)
}
// Every timetable slot's faculty must actually hold that subject in that section.
{
  let orphans = 0
  for (const t of timetable) {
    if (!t.faculty_id) continue
    const held = assignments.some((a) => a.faculty_id === t.faculty_id && a.subject_id === t.subject_id
      && a.section_id === t.section_id && a.is_active)
    if (!held) {
      orphans += 1
      const s = secById.get(t.section_id)
      say(`  FAIL  ${profById.get(t.faculty_id)?.full_name} teaches ${subById.get(t.subject_id)?.code} to ${ROMAN[s.year_number]}-${s.name} without an allocation`)
    }
  }
  check('timetable slots without a matching allocation', orphans, 0)
}
say()

say('## Floor duty')
// The roster moved from a department announcement into public.floor_duties, so each faculty
// member is shown only their own turns.
{
  const duties = await selectAll('floor_duties').catch(() => [])
  check('floor duty slots', duties.length, data.floor_duty.length)
  check('leftover floor duty announcement', announcements.filter((a) => a.title.startsWith('Floor Duty')).length, 0)
  const perFaculty = new Map()
  for (const duty of duties) perFaculty.set(duty.faculty_id, (perFaculty.get(duty.faculty_id) ?? 0) + 1)
  note('faculty on the roster', String(perFaculty.size))
}
say()

say('## Live sign-in and row-level security')
{
  const anonKey = readFileSync(join(HERE, '..', '..', 'frontend', '.env.local'), 'utf8')
    .split(/\r?\n/).find((l) => l.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')).split('=')[1].trim()
  const asUser = () => createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // A student signs in with roll number + last 4 digits.
  const sample = data.students.find((s) => s.user_id && s.year === 'III')
  const client = asUser()
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
    email: `${sample.user_id}@${data.meta.email_domain}`, password: studentPassword(sample.register_number),
  })
  check(`student sign-in (${sample.user_id})`, signInError ? `FAILED ${signInError.message}` : 'ok', 'ok')
  if (signIn?.user) {
    const { data: own } = await client.from('profiles').select('id, full_name').eq('id', signIn.user.id).maybeSingle()
    check('student can read own profile', own?.full_name ?? 'null', sample.name)
    const { data: all } = await client.from('profiles').select('id')
    note('profile rows visible to that student', String(all?.length ?? 0))
    const { data: marks, error: marksError } = await client.from('marks').select('id')
    note('marks rows visible to that student', marksError ? `blocked (${marksError.code})` : String(marks?.length ?? 0))
    await client.auth.signOut()
  }

  // A faculty member signs in with staff ID + name@aids.
  const teacher = data.faculty.find((f) => f.key === 'divya')
  const staffClient = asUser()
  const { data: staffSignIn, error: staffError } = await staffClient.auth.signInWithPassword({
    email: `${teacher.user_id}@${data.meta.email_domain}`, password: staffPassword(teacher.user_id),
  })
  check(`faculty sign-in (${teacher.user_id})`, staffError ? `FAILED ${staffError.message}` : 'ok', 'ok')
  if (staffSignIn?.user) {
    const { data: tt } = await staffClient.from('timetable_entries').select('id').eq('faculty_id', staffSignIn.user.id)
    note('own timetable periods visible to that faculty', String(tt?.length ?? 0))
    await staffClient.auth.signOut()
  }

  // The HOD signs in.
  const hod = data.faculty.find((f) => f.role === 'hod')
  const hodClient = asUser()
  const { error: hodError } = await hodClient.auth.signInWithPassword({
    email: `${hod.user_id}@${data.meta.email_domain}`, password: staffPassword(hod.user_id),
  })
  check(`HOD sign-in (${hod.user_id})`, hodError ? `FAILED ${hodError.message}` : 'ok', 'ok')
  await hodClient.auth.signOut()
}
say()

say('## Auth accounts')
const authUsers = await listAuthUsers()
note('total auth.users', String(authUsers.length))
note('expected', String(data.faculty.length + data.students.filter((s) => s.user_id).length + 1 /* admin */ + 3 /* retired */))
say()

say(failures === 0 ? '## RESULT: all checks passed' : `## RESULT: ${failures} check(s) FAILED`)
writeFileSync(join(OUT, 'verification.md'), report.join('\n') + '\n', 'utf8')
console.log(`\nWritten to ${join(OUT, 'verification.md')}`)
process.exit(failures === 0 ? 0 : 1)
