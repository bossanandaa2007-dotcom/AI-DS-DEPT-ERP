// Loads the real AI&DS pilot data from pilot-data.json into the deployed database.
//
//   node supabase/pilot/3-load.mjs
//
// Safe to re-run: every step looks the record up by its natural key first, so a run that
// fails partway can simply be run again. Writes out/credentials.csv for handover.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { HERE, OUT, admin, ok, selectAll, listAuthUsers, staffPassword, studentPassword } from './lib.mjs'

const data = JSON.parse(readFileSync(join(HERE, 'pilot-data.json'), 'utf8'))
const { meta } = data
mkdirSync(OUT, { recursive: true })

const step = (n, label) => console.log(`\n[${n}] ${label}`)
const done = (label, n) => console.log(`    ${label}: ${n}`)

// ---------------------------------------------------------------- 1. department
step(1, 'Department and academic year')
const departments = await selectAll('departments')
const department = departments.find((d) => d.code === meta.department_code)
if (!department) throw new Error(`No department with code ${meta.department_code}. Aborting rather than guessing.`)
done('department', `${department.code} — ${department.name}`)

const years = await selectAll('academic_years')
const year = years.find((y) => y.department_id === department.id && y.name === meta.academic_year)
if (!year) throw new Error(`No academic year ${meta.academic_year}. Aborting.`)
done('academic year', `${year.name} (${year.starts_on} → ${year.ends_on}, active=${year.is_active})`)

// The retained super-admin account keeps its login but gets a department-appropriate name.
// Rename it further from User management if a specific person should own it.
{
  const { error } = await admin.from('profiles')
    .update({ full_name: 'AI&DS ERP Administrator', designation: 'System Administrator', department_id: department.id })
    .eq('email', 'admin@vernex.in')
  if (error) console.log(`    (could not rename admin@vernex.in: ${error.message})`)
  else done('super admin', 'admin@vernex.in renamed to "AI&DS ERP Administrator"')
}

// ------------------------------------------------------------ 2. period grid
step(2, 'Timetable periods (corrected KCG timings, 7 teaching periods)')
{
  const existing = await selectAll('timetable_periods')
  const wanted = [
    ...data.periods.map((p, i) => ({
      label: `P${p.period}`, period_number: p.period, starts_at: p.starts_at, ends_at: p.ends_at,
      display_order: i + 1, period_type: 'teaching',
    })),
    ...data.breaks.map((b) => ({
      label: b.label, period_number: null, starts_at: b.starts_at, ends_at: b.ends_at,
      display_order: 0, period_type: b.period_type,
    })),
  ]
  // Order breaks into the display sequence by start time.
  wanted.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  wanted.forEach((row, i) => { row.display_order = i + 1; row.department_id = department.id; row.is_active = true })

  for (const row of wanted) {
    const match = existing.find((e) => e.department_id === department.id && e.label === row.label)
    if (match) ok('timetable_periods', await admin.from('timetable_periods').update(row).eq('id', match.id))
    else ok('timetable_periods', await admin.from('timetable_periods').insert(row))
  }
  const after = await selectAll('timetable_periods')
  done('periods', after.filter((p) => p.period_type === 'teaching').length + ' teaching + '
    + after.filter((p) => p.period_type !== 'teaching').length + ' breaks')
}

// -------------------------------------------------------------- 3. semesters
step(3, 'Semesters')
const semesterByNumber = new Map()
{
  const existing = await selectAll('semesters')
  for (const number of data.semesters) {
    const row = {
      academic_year_id: year.id, number, name: `Semester ${number}`,
      starts_on: meta.semester_starts, ends_on: meta.semester_ends,
    }
    let match = existing.find((s) => s.academic_year_id === year.id && s.number === number)
    if (match) ok('semesters', await admin.from('semesters').update(row).eq('id', match.id))
    else match = ok('semesters', await admin.from('semesters').insert(row).select().single())
    semesterByNumber.set(number, match.id)
  }
  done('semesters', [...semesterByNumber.keys()].join(', '))
}

// --------------------------------------------------------------- 4. sections
step(4, 'Sections')
const ROMAN = { II: 2, III: 3, IV: 4 }
const sectionKey = (y, s) => `${y}-${s}`
const sectionByKey = new Map()
{
  const existing = await selectAll('sections')
  for (const s of data.sections) {
    const semester_id = semesterByNumber.get(s.semester)
    const row = {
      department_id: department.id, academic_year_id: year.id, semester_id,
      year_number: ROMAN[s.year], name: s.section, capacity: 70, is_active: true,
    }
    let match = existing.find((e) => e.academic_year_id === year.id && e.semester_id === semester_id
      && e.year_number === row.year_number && e.name === row.name)
    if (match) ok('sections', await admin.from('sections').update(row).eq('id', match.id))
    else match = ok('sections', await admin.from('sections').insert(row).select().single())
    sectionByKey.set(sectionKey(s.year, s.section), { id: match.id, semester_id, ...s })
  }
  done('sections', [...sectionByKey.keys()].join(', '))
}

// --------------------------------------------------------------- 5. subjects
step(5, 'Subjects')
const subjectByKey = new Map()
{
  const existing = await selectAll('subjects')
  for (const s of data.subjects) {
    const semester_id = semesterByNumber.get(s.semester)
    const row = {
      department_id: department.id, semester_id, code: s.code, name: s.name,
      credits: s.credits, is_lab: s.is_lab, subject_type: s.subject_type,
      weekly_hours: s.weekly_hours, study_year: s.study_year, is_active: true,
    }
    let match = existing.find((e) => e.department_id === department.id
      && e.semester_id === semester_id && e.code === s.code)
    if (match) ok('subjects', await admin.from('subjects').update(row).eq('id', match.id))
    else match = ok('subjects', await admin.from('subjects').insert(row).select().single())
    subjectByKey.set(`${s.semester}:${s.code}`, match.id)
  }
  done('subjects', subjectByKey.size)
}

// ------------------------------------------------------------------ 6. people
step(6, 'Auth accounts and profiles')
const authByEmail = new Map()
for (const u of await listAuthUsers()) authByEmail.set((u.email ?? '').toLowerCase(), u)

const credentials = []
const profileIdByKey = new Map()   // faculty key -> profile id
const profileIdByReg = new Map()   // register number -> profile id

/** Retry around the Auth admin API, which rate-limits bulk provisioning. */
async function withRetry(label, run) {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const { data: result, error } = await run()
    if (!error) return result
    lastError = error
    const retryable = error.status === 429 || (error.status >= 500 && error.status < 600)
    if (!retryable) throw new Error(`${label}: ${error.message}`)
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)))
  }
  throw new Error(`${label}: gave up after retries — ${lastError.message}`)
}

async function upsertPerson({ userId, password, fullName, role, designation, sectionId, registerNumber, kind, label }) {
  const email = `${userId}@${meta.email_domain}`.toLowerCase()
  // GoTrue applies its minimum-password-length policy to admin UPDATE but not to admin
  // CREATE. A student's 4-digit password therefore sets fine at creation and is accepted at
  // sign-in, but re-running this script would fail trying to rewrite it. When that happens
  // the existing password is left in place and only the profile fields are refreshed.
  const existing = authByEmail.get(email)
  let result
  if (existing) {
    const attempt = await admin.auth.admin.updateUserById(existing.id, {
      password, email_confirm: true, user_metadata: { full_name: fullName },
    })
    if (attempt.error && /at least \d+ characters/i.test(attempt.error.message)) {
      result = await withRetry(`update ${email}`, () => admin.auth.admin.updateUserById(existing.id, {
        email_confirm: true, user_metadata: { full_name: fullName },
      }))
    } else if (attempt.error) {
      throw new Error(`update ${email}: ${attempt.error.message}`)
    } else {
      result = attempt.data
    }
  } else {
    result = await withRetry(`create ${email}`, () => admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    }))
  }
  const authUser = result.user
  authByEmail.set(email, authUser)

  // The on_auth_user_created trigger inserts an inactive student profile; correct it here.
  // If the trigger did not fire the row will not exist, so fall back to an explicit insert.
  const profile = {
    full_name: fullName, email, role, status: 'active',
    department_id: department.id, section_id: sectionId ?? null,
    employee_or_register_number: registerNumber ?? null,
    designation: designation ?? null,
  }
  const updated = ok('profiles', await admin.from('profiles').update(profile).eq('id', authUser.id).select('id'))
  if (!updated.length) {
    ok('profiles', await admin.from('profiles').insert({ id: authUser.id, ...profile }))
  }
  credentials.push({ kind, label, name: fullName, user_id: userId, email, password })
  return authUser.id
}

for (const f of data.faculty) {
  const id = await upsertPerson({
    userId: f.user_id, password: staffPassword(f.user_id), fullName: f.name, role: f.role,
    designation: f.designation, kind: f.is_department ? 'faculty' : 'faculty (visiting)',
    label: f.designation,
  })
  profileIdByKey.set(f.key, id)
  process.stdout.write('.')
}
console.log(`\n    faculty accounts: ${data.faculty.length}`)

let n = 0
for (const s of data.students) {
  const section = sectionByKey.get(sectionKey(s.year, s.section))
  if (!s.user_id) {
    // Duplicate register number: no unique login can be derived, so the account is skipped.
    credentials.push({
      kind: 'student (BLOCKED)', label: `${s.year}-${s.section}`, name: s.name,
      user_id: '', email: '', password: '',
    })
    continue
  }
  const id = await upsertPerson({
    userId: s.user_id, password: studentPassword(s.register_number), fullName: s.name, role: 'student',
    sectionId: section.id, registerNumber: s.register_number,
    kind: 'student', label: `${s.year}-${s.section}`,
  })
  profileIdByReg.set(s.register_number, id)
  n += 1
  if (n % 25 === 0) process.stdout.write(` ${n}`)
  else process.stdout.write('.')
}
console.log(`\n    student accounts: ${n}`)

// ------------------------------------------------------------- 7. enrollments
step(7, 'Enrollments')
{
  const existing = await selectAll('enrollments')
  let created = 0
  for (const s of data.students) {
    if (!s.user_id) continue
    const studentId = profileIdByReg.get(s.register_number)
    const section = sectionByKey.get(sectionKey(s.year, s.section))
    if (existing.some((e) => e.student_id === studentId && e.academic_year_id === year.id)) continue
    ok('enrollments', await admin.from('enrollments').insert({
      student_id: studentId, section_id: section.id, academic_year_id: year.id, status: 'active',
    }))
    created += 1
  }
  done('enrollments created', created)
}

// ------------------------------------------------------ 8. faculty assignments
step(8, 'Faculty assignments')
{
  const existing = await selectAll('faculty_assignments')
  let created = 0
  for (const a of data.assignments) {
    const section = sectionByKey.get(sectionKey(a.year, a.section))
    const facultyId = profileIdByKey.get(a.faculty)
    const subjectId = a.code ? subjectByKey.get(`${a.semester}:${a.code}`) : null
    if (!facultyId) throw new Error(`no profile for faculty key ${a.faculty}`)
    if (a.code && !subjectId) throw new Error(`no subject for ${a.semester}:${a.code}`)
    const match = existing.find((e) => e.faculty_id === facultyId && e.subject_id === subjectId
      && e.section_id === section.id && e.academic_year_id === year.id
      && e.semester_id === section.semester_id && e.assignment_type === a.assignment_type)
    if (match) continue
    ok('faculty_assignments', await admin.from('faculty_assignments').insert({
      faculty_id: facultyId, subject_id: subjectId, section_id: section.id,
      academic_year_id: year.id, semester_id: section.semester_id,
      assignment_type: a.assignment_type, is_active: true,
      effective_from: meta.semester_starts, effective_to: meta.semester_ends,
      weekly_hours: a.assignment_type === 'class_teacher' || a.assignment_type === 'faculty_guide'
        ? 0 : a.weekly_hours,
    }))
    created += 1
  }
  done('assignments created', created)
}

// --------------------------------------------------------- 9. timetable entries
step(9, 'Timetable entries')
const rejected = []
{
  const periodRows = await selectAll('timetable_periods')
  const periodIdByNumber = new Map(periodRows
    .filter((p) => p.department_id === department.id && p.period_number)
    .map((p) => [p.period_number, p.id]))
  const existing = await selectAll('timetable_entries')
  let created = 0
  for (const t of data.timetable) {
    const section = sectionByKey.get(sectionKey(t.year, t.section))
    const subjectId = subjectByKey.get(`${t.semester}:${t.code}`)
    const facultyId = t.faculty ? profileIdByKey.get(t.faculty) : null
    if (!subjectId) throw new Error(`no subject for ${t.semester}:${t.code}`)
    if (existing.some((e) => e.section_id === section.id && e.day_of_week === t.day_of_week
      && e.period === t.period && e.subject_id === subjectId)) continue
    const { error } = await admin.from('timetable_entries').insert({
      section_id: section.id, subject_id: subjectId, faculty_id: facultyId, lab_assistant_id: null,
      day_of_week: t.day_of_week, period: t.period, starts_at: t.starts_at, ends_at: t.ends_at,
      room: t.room, lab: t.lab,
      academic_year_id: year.id, department_id: department.id, semester_id: section.semester_id,
      timetable_period_id: periodIdByNumber.get(t.period) ?? null,
      effective_from: meta.semester_starts, effective_to: meta.semester_ends, is_active: true,
    })
    if (error) {
      // A batch-split slot holds two subjects in one period. If the deployed database still
      // carries unique(section_id, day_of_week, period) the second row is refused; record it
      // rather than failing the whole load.
      if (error.code === '23505' && t.batch) { rejected.push(t); continue }
      throw new Error(`timetable ${t.year}-${t.section} d${t.day_of_week} P${t.period} ${t.code}: ${error.code} ${error.message}`)
    }
    created += 1
  }
  done('timetable entries created', created)
  if (rejected.length) {
    console.log(`    batch-split rows refused by the slot uniqueness constraint: ${rejected.length}`)
    for (const t of rejected) console.log(`      ${t.year}-${t.section} day ${t.day_of_week} P${t.period} ${t.code} (batch ${t.batch})`)
  }
}

// ------------------------------------------------------ 10. floor duty notice
step(10, 'Floor duty announcement')
{
  const hod = data.faculty.find((f) => f.role === 'hod')
  const authorId = profileIdByKey.get(hod.key)
  const nameOf = (key) => data.faculty.find((f) => f.key === key)?.name ?? key
  const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const shifts = [...new Set(data.floor_duty.map((f) => f.shift))]
  const lines = order.map((day) => {
    const forDay = shifts.map((s) => {
      const hit = data.floor_duty.find((f) => f.day === day && f.shift === s)
      return `    ${s}: ${hit ? nameOf(hit.faculty) : '—'}`
    })
    return `${day}\n${forDay.join('\n')}`
  })
  const title = 'Floor Duty Roster — Odd Semester 2026-27'
  const message = `Floor duty allocation for the odd semester, academic year 2026-27.\n\n${lines.join('\n\n')}\n\nSource: Floor Duty 2026-27 (department circular).`
  const existing = await selectAll('announcements')
  const match = existing.find((a) => a.title === title)
  const row = {
    author_id: authorId, department_id: department.id, title, message,
    category: 'Department', priority: 'normal', audience: 'faculty',
    publish_date: meta.semester_starts,
  }
  if (match) ok('announcements', await admin.from('announcements').update(row).eq('id', match.id))
  else ok('announcements', await admin.from('announcements').insert(row))
  done('announcement', title)
}

// ------------------------------------------------------------ 11. credentials
step(11, 'Credential sheet')
{
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const rows = [['type', 'class / designation', 'name', 'login id', 'auth email', 'initial password']]
  for (const c of credentials) rows.push([c.kind, c.label, c.name, c.user_id, c.email, c.password])
  const file = join(OUT, 'credentials.csv')
  writeFileSync(file, rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n', 'utf8')
  done('written', `${file} (${credentials.length} rows)`)
}

console.log('\nLoad complete.')
if (rejected.length) {
  console.log(`NOTE: ${rejected.length} batch-split timetable rows could not be stored — see report.`)
}
