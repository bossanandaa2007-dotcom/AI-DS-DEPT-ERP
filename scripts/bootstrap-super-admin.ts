import { createClient } from '@supabase/supabase-js'

const userId = 'admin-vnx'
const fullName = 'Vernex Super Admin'
const bootstrapPassword = '12345678'

function requiredEnvironment(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'AUTH_EMAIL_DOMAIN') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required in the local/server environment.`)
  return value
}

function normalizedUserId(value: string) {
  return value.trim().toLowerCase()
}

async function authUsersForEmail(admin: ReturnType<typeof createClient>, email: string) {
  const matches: Array<{ id: string; email?: string }> = []
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error('Unable to inspect existing Supabase Auth users.')
    const users = data.users ?? []
    matches.push(...users.filter((user) => user.email?.toLowerCase() === email).map((user) => ({ id: user.id, email: user.email })))
    if (users.length < 1000) return matches
    page += 1
  }
}

async function main() {
  const supabaseUrl = requiredEnvironment('SUPABASE_URL')
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY')
  const authEmailDomain = requiredEnvironment('AUTH_EMAIL_DOMAIN').toLowerCase()
  const browserAuthEmailDomain = process.env.VITE_AUTH_EMAIL_DOMAIN?.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(authEmailDomain)) throw new Error('AUTH_EMAIL_DOMAIN is invalid.')
  if (browserAuthEmailDomain && browserAuthEmailDomain !== authEmailDomain) throw new Error('AUTH_EMAIL_DOMAIN and VITE_AUTH_EMAIL_DOMAIN must match.')

  const normalizedId = normalizedUserId(userId)
  const internalAuthEmail = `${normalizedId}@${authEmailDomain}`
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const [{ data: profileMatches, error: profileLookupError }, authMatches] = await Promise.all([
    admin.from('profiles').select('id, employee_or_register_number').ilike('employee_or_register_number', normalizedId),
    authUsersForEmail(admin, internalAuthEmail),
  ])
  if (profileLookupError) throw new Error('Unable to inspect existing ERP profiles.')
  const matchingProfiles = (profileMatches ?? []).filter((profile) => profile.employee_or_register_number?.trim().toLowerCase() === normalizedId)
  if (matchingProfiles.length > 1 || authMatches.length > 1) throw new Error('Conflicting duplicate Auth or profile records were found. Resolve them manually; no records were changed.')
  const existingProfile = matchingProfiles[0]
  const existingAuth = authMatches[0]
  if (existingProfile && existingAuth && existingProfile.id !== existingAuth.id) throw new Error('The matching Auth account and profile have different IDs. Resolve this conflict manually; no records were changed.')
  if (existingProfile && !existingAuth) throw new Error('A matching profile exists without its Auth account. Resolve this conflict manually; no records were changed.')

  let authUserId: string
  const metadata = { full_name: fullName, employee_or_register_number: normalizedId, role: 'super_admin', status: 'active', bootstrap_account: true }
  if (existingAuth) {
    const { data, error } = await admin.auth.admin.updateUserById(existingAuth.id, { password: bootstrapPassword, email_confirm: true, user_metadata: metadata })
    if (error || !data.user) throw new Error('Unable to repair the bootstrap Auth account.')
    authUserId = data.user.id
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: internalAuthEmail, password: bootstrapPassword, email_confirm: true, user_metadata: metadata })
    if (error || !data.user) throw new Error('Unable to create the bootstrap Auth account.')
    authUserId = data.user.id
  }

  const profile = { id: authUserId, full_name: fullName, email: internalAuthEmail, employee_or_register_number: normalizedId, role: 'super_admin', status: 'active', department_id: null, section_id: null, faculty_responsibilities: [] }
  let { error: profileError } = await admin.from('profiles').upsert(profile, { onConflict: 'id' })
  let assignedDepartment: string | null = null
  if (profileError && /null value.*department_id|department_id.*not-null/i.test(profileError.message)) {
    const { data: departments, error: departmentError } = await admin.from('departments').select('id, name').order('name').limit(1)
    if (departmentError || !departments?.[0]) throw new Error('department_id is mandatory, but no department is available for the bootstrap account.')
    assignedDepartment = departments[0].name
    profileError = (await admin.from('profiles').upsert({ ...profile, department_id: departments[0].id }, { onConflict: 'id' })).error
  }
  if (profileError) throw new Error('Unable to create the bootstrap ERP profile.')

  const { error: auditError } = await admin.from('audit_logs').insert({ actor_id: null, actor_role: 'system', action: 'bootstrap', module: 'user_management', record_reference: authUserId, after_data: { full_name: fullName, user_id: normalizedId, role: 'super_admin', status: 'active' } })
  if (auditError) throw new Error('The bootstrap account was created but its audit record could not be written.')

  const [{ data: verifiedProfile, error: verifiedProfileError }, { data: verifiedAuth, error: verifiedAuthError }] = await Promise.all([
    admin.from('profiles').select('id, employee_or_register_number, role, status').eq('id', authUserId).single(),
    admin.auth.admin.getUserById(authUserId),
  ])
  if (verifiedProfileError || !verifiedProfile || verifiedProfile.employee_or_register_number !== normalizedId || verifiedProfile.role !== 'super_admin' || verifiedProfile.status !== 'active') throw new Error('Bootstrap profile verification failed.')
  if (verifiedAuthError || !verifiedAuth.user || verifiedAuth.user.email?.toLowerCase() !== internalAuthEmail) throw new Error('Bootstrap Auth verification failed.')
  const { error: loginError } = await admin.auth.signInWithPassword({ email: internalAuthEmail, password: bootstrapPassword })
  if (loginError) throw new Error('Bootstrap password authentication verification failed.')

  console.log(assignedDepartment ? `Bootstrap Super Admin is ready; assigned department: ${assignedDepartment}.` : 'Bootstrap Super Admin is ready.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Bootstrap Super Admin failed.')
  process.exitCode = 1
})
