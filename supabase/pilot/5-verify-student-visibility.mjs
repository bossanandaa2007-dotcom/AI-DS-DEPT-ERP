// Checks whether a student can read their department's teaching staff, which is what makes
// faculty names appear on the student timetable. Run after applying
// supabase/migrations/202608060111_students_read_department_staff.sql.
//
//   node supabase/pilot/5-verify-student-visibility.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs'
import { HERE, env, studentPassword } from './lib.mjs'

const data = JSON.parse(readFileSync(join(HERE, 'pilot-data.json'), 'utf8'))
const anonKey = readFileSync(join(HERE, '..', '..', 'frontend', '.env.local'), 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')).split('=')[1].trim()

const student = data.students.find((s) => s.user_id && s.year === 'III')
const client = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: signIn, error } = await client.auth.signInWithPassword({
  email: `${student.user_id}@${data.meta.email_domain}`,
  password: studentPassword(student.register_number),
})
if (error) throw new Error(`sign-in failed: ${error.message}`)
console.log(`Signed in as ${student.name} (${student.user_id})\n`)

const { data: profiles } = await client.from('profiles').select('id, full_name, role')
const byRole = {}
for (const p of profiles ?? []) byRole[p.role] = (byRole[p.role] ?? 0) + 1
console.log(`profiles visible: ${profiles?.length ?? 0}  ${JSON.stringify(byRole)}`)

const staff = (profiles ?? []).filter((p) => ['faculty', 'hod', 'lab_assistant'].includes(p.role))
const otherStudents = (profiles ?? []).filter((p) => p.role === 'student' && p.id !== signIn.user.id)

// Can the timetable now name the faculty for every one of this student's periods?
const { data: timetable } = await client.from('timetable_entries').select('id, faculty_id')
const known = new Set(staff.map((p) => p.id))
const named = (timetable ?? []).filter((t) => t.faculty_id && known.has(t.faculty_id)).length

console.log()
console.log(`  teaching staff visible        : ${staff.length}   ${staff.length ? 'PASS' : 'FAIL — run the migration'}`)
console.log(`  other students visible        : ${otherStudents.length}   ${otherStudents.length === 0 ? 'PASS (privacy intact)' : 'FAIL — students can see each other'}`)
console.log(`  own timetable periods         : ${timetable?.length ?? 0}`)
console.log(`  periods with a resolvable name: ${named}   ${named === (timetable?.length ?? 0) && named > 0 ? 'PASS' : 'FAIL'}`)
if (staff.length) console.log(`\n  e.g. ${staff.slice(0, 4).map((p) => `${p.full_name} (${p.role})`).join(', ')}`)

await client.auth.signOut()
