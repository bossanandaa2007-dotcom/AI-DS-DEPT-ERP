// Full read-only dump of every table plus the auth user list, before any destructive step.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TABLES, OUT, listAuthUsers, selectAll } from './lib.mjs'

mkdirSync(OUT, { recursive: true })
const dump = { taken_at: new Date().toISOString(), tables: {}, auth_users: [] }

for (const table of TABLES) {
  try {
    dump.tables[table] = await selectAll(table)
    console.log(`  ${table.padEnd(26)} ${dump.tables[table].length}`)
  } catch (error) {
    dump.tables[table] = { error: String(error.message) }
    console.log(`  ${table.padEnd(26)} ERROR ${error.message}`)
  }
}
dump.auth_users = (await listAuthUsers()).map((u) => ({
  id: u.id, email: u.email, created_at: u.created_at,
  last_sign_in_at: u.last_sign_in_at, user_metadata: u.user_metadata,
}))
console.log(`  ${'auth.users'.padEnd(26)} ${dump.auth_users.length}`)

const file = join(OUT, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(file, JSON.stringify(dump, null, 1), 'utf8')
console.log(`\nWritten to ${file}`)
console.log('Note: this captures table rows and auth metadata only. It does NOT capture password hashes.')
