import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type AppRole = 'super_admin' | 'hod' | 'faculty' | 'lab_assistant' | 'student'
type FacultyResponsibility = 'subject_faculty' | 'class_teacher' | 'faculty_guide' | 'lab_faculty'
type FacultyTeachingScope = {
  academicYearId: string
  studyYear: number
  sectionId: string
  effectiveFrom: string
  effectiveTo?: string
  isActive: boolean
}

type ProvisionRequest = {
  fullName: string
  userId: string
  dateOfBirth: string
  role: AppRole
  departmentId: string
  sectionId?: string
  academicYearId?: string
  studyYear?: number
  phone?: string
  designation?: string
  employmentType?: string
  joiningDate?: string
  isActive?: boolean
  teachingScopes?: FacultyTeachingScope[]
  responsibilities?: FacultyResponsibility[]
}

const roles: AppRole[] = ['super_admin', 'hod', 'faculty', 'lab_assistant', 'student']
const responsibilities: FacultyResponsibility[] = ['subject_faculty', 'class_teacher', 'faculty_guide', 'lab_faculty']
const aiDsDepartmentCode = 'AI-DS'

const badRequest = (message: string) => new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const safeError = (status: number, message: string) => new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

function identifier(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(normalized)) throw new Error('User ID may contain only letters, numbers, dots, underscores, and hyphens.')
  return normalized
}

function parseDateOfBirth(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a valid date of birth.')
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value || date > new Date()) throw new Error('Enter a valid date of birth.')
  return value
}

function parseEffectiveDate(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Enter a valid ${field}.`)
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error(`Enter a valid ${field}.`)
  return value
}

function passwordFromDateOfBirth(date: string) {
  const [year, month, day] = date.split('-')
  return `${day}${month}${year}`
}

function getEmailDomain() {
  const domain = Deno.env.get('AUTH_EMAIL_DOMAIN')?.trim().toLowerCase()
  if (!domain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) throw new Error('Account provisioning is not configured.')
  return domain
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return safeError(405, 'Method not allowed.')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !serviceRoleKey) return safeError(500, 'Account provisioning is not configured.')
  if (!authorization?.startsWith('Bearer ')) return safeError(401, 'Authentication is required.')

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const token = authorization.slice('Bearer '.length)
  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(token)
  if (callerAuthError || !callerAuth.user) return safeError(401, 'Authentication is required.')

  const { data: caller, error: callerError } = await admin
    .from('profiles')
    .select('id, role, status')
    .eq('id', callerAuth.user.id)
    .maybeSingle()
  if (callerError || !caller || caller.role !== 'super_admin' || caller.status !== 'active') return safeError(403, 'Only an active Super Admin may provision accounts.')

  let input: ProvisionRequest
  try {
    input = await request.json() as ProvisionRequest
    const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : ''
    if (fullName.length < 2 || fullName.length > 160) throw new Error('Enter a valid full name.')
    if (!/^[A-Za-z .'-]+$/.test(fullName)) throw new Error('Full name may contain only letters, spaces, apostrophes, hyphens, and periods.')
    const userId = identifier(input.userId)
    const normalizedId = userId.toLowerCase()
    const dateOfBirth = parseDateOfBirth(input.dateOfBirth)
    if (!roles.includes(input.role)) throw new Error('Select a valid role.')
    if (typeof input.departmentId !== 'string' || !input.departmentId) throw new Error('Select a department.')
    if (input.role === 'student' && (!input.sectionId || !input.academicYearId || !Number.isInteger(input.studyYear) || input.studyYear! < 1 || input.studyYear! > 4)) throw new Error('Student accounts require an academic year, Study Year (1–4), and section.')
    if (input.role !== 'student' && (input.sectionId || input.academicYearId || input.studyYear !== undefined)) throw new Error('Only student accounts may include enrollment details.')
    if (input.responsibilities?.some((item) => !responsibilities.includes(item))) throw new Error('Invalid faculty responsibilities.')
    if (input.role === 'faculty') {
      const employmentType = typeof input.employmentType === 'string' ? input.employmentType.trim() : ''
      const joiningDate = parseEffectiveDate(input.joiningDate, 'Joining Date')
      if (!employmentType || employmentType.length > 80) throw new Error('Select a valid Employment Type.')
      if (!Array.isArray(input.teachingScopes) || input.teachingScopes.length === 0) throw new Error('Select at least one Faculty teaching scope.')
      for (const scope of input.teachingScopes) {
        if (!scope || typeof scope.academicYearId !== 'string' || typeof scope.sectionId !== 'string' || !Number.isInteger(scope.studyYear) || scope.studyYear < 1 || scope.studyYear > 4 || typeof scope.isActive !== 'boolean') throw new Error('Each Faculty teaching scope requires an Academic Year, Study Year, Section, and Active Status.')
        const effectiveFrom = parseEffectiveDate(scope.effectiveFrom, 'scope Effective From date')
        const effectiveTo = scope.effectiveTo ? parseEffectiveDate(scope.effectiveTo, 'scope Effective To date') : undefined
        if (effectiveTo && effectiveTo < effectiveFrom) throw new Error('A scope Effective To date cannot be before its Effective From date.')
      }
      input = { ...input, employmentType, joiningDate, teachingScopes: input.teachingScopes }
    }
    input = { ...input, fullName, userId: normalizedId, dateOfBirth, phone: input.phone?.trim() || undefined, designation: input.designation?.trim() || undefined, responsibilities: input.role === 'student' ? [] : (input.responsibilities ?? []) }
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid account details.')
  }

  let email: string
  try {
    email = `${input.userId.toLowerCase()}@${getEmailDomain()}`
  } catch {
    return safeError(500, 'Account provisioning is not configured.')
  }
  let createdUserId: string | null = null
  try {
    if (input.role === 'student' || input.role === 'hod' || input.role === 'faculty') {
      const { data: aiDsDepartment, error: departmentError } = await admin.from('departments').select('id').eq('code', aiDsDepartmentCode).maybeSingle()
      if (departmentError || !aiDsDepartment) return safeError(500, 'The AI-DS department is not configured.')
      input = { ...input, departmentId: aiDsDepartment.id }
    }

    const { data: existingProfiles, error: duplicateError } = await admin
      .from('profiles')
      .select('employee_or_register_number')
    if (duplicateError) throw new Error('Unable to validate the User ID.')
    if (existingProfiles?.some((profile) => profile.employee_or_register_number?.trim().toLowerCase() === input.userId)) return safeError(409, 'An account already exists for this User ID.')

    if (input.role === 'student') {
      const { data: section, error: sectionError } = await admin.from('sections').select('id, department_id, academic_year_id, year_number').eq('id', input.sectionId!).maybeSingle()
      if (sectionError || !section || section.department_id !== input.departmentId || section.academic_year_id !== input.academicYearId || section.year_number !== input.studyYear) return badRequest('The selected Academic Year, Study Year, and Section are not compatible.')
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: passwordFromDateOfBirth(input.dateOfBirth),
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    })
    if (createError || !created.user) {
      if (/already been registered|already exists|duplicate/i.test(createError?.message ?? '')) return safeError(409, 'An account already exists for this User ID.')
      throw new Error('Unable to create the authentication account.')
    }
    createdUserId = created.user.id

    const { error: profileError } = await admin.from('profiles').upsert({
      id: createdUserId,
      full_name: input.fullName,
      email,
      employee_or_register_number: input.userId,
      date_of_birth: input.dateOfBirth,
      role: input.role,
      department_id: input.departmentId,
      section_id: input.role === 'student' ? input.sectionId : null,
      phone: input.phone ?? null,
      designation: input.role === 'student' ? null : (input.designation ?? null),
      employment_type: input.role === 'faculty' ? input.employmentType ?? null : null,
      joining_date: input.role === 'faculty' ? input.joiningDate ?? null : null,
      faculty_responsibilities: input.responsibilities ?? [],
      status: input.role === 'faculty' && input.isActive === false ? 'inactive' : 'active',
    }, { onConflict: 'id' })
    if (profileError) {
      if (/duplicate|unique/i.test(profileError.message)) throw new Error('DUPLICATE_USER_ID')
      throw new Error('Unable to create the ERP profile.')
    }

    if (input.role === 'student') {
      const { error: enrollmentError } = await admin.from('enrollments').insert({ student_id: createdUserId, section_id: input.sectionId!, academic_year_id: input.academicYearId!, status: 'active' })
      if (enrollmentError) throw new Error('Unable to create the student enrollment.')
    }

    if (input.role === 'faculty') {
      const { error: scopeError } = await admin.from('faculty_teaching_scopes').insert((input.teachingScopes ?? []).map((scope) => ({
        faculty_id: createdUserId,
        academic_year_id: scope.academicYearId,
        study_year: scope.studyYear,
        section_id: scope.sectionId,
        is_active: input.isActive !== false && scope.isActive,
        effective_from: scope.effectiveFrom,
        effective_to: scope.effectiveTo ?? null,
      })))
      if (scopeError) {
        if (/duplicate|unique/i.test(scopeError.message)) throw new Error('DUPLICATE_FACULTY_SCOPE')
        throw new Error('Unable to create the Faculty teaching scope.')
      }
    }

    const { error: auditError } = await admin.from('audit_logs').insert({
      actor_id: caller.id,
      actor_role: caller.role,
      action: 'provision_account',
      module: 'user_management',
      record_reference: createdUserId,
      after_data: { role: input.role, department_id: input.departmentId, has_enrollment: input.role === 'student', teaching_scope_count: input.role === 'faculty' ? input.teachingScopes?.length ?? 0 : 0 },
    })
    if (auditError) throw new Error('Unable to record account provisioning.')
    return new Response(JSON.stringify({ id: createdUserId, fullName: input.fullName, role: input.role, status: 'active' }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined)
    if (error instanceof Error && error.message === 'DUPLICATE_USER_ID') return safeError(409, 'An account already exists for this User ID.')
    if (error instanceof Error && error.message === 'DUPLICATE_FACULTY_SCOPE') return safeError(409, 'An active Faculty teaching scope already exists for one of the selected sections.')
    return safeError(500, error instanceof Error && error.message.startsWith('Unable to') ? error.message : 'Account provisioning failed.')
  }
})
