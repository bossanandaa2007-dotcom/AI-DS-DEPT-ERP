import { supabase } from '@/lib/supabase'
import { readableSupabaseError } from '@/services/supabase/query'
import type { Database } from '@/types/database.types'

type AppRole = Database['public']['Enums']['app_role']
type FacultyResponsibility = Database['public']['Enums']['faculty_responsibility']

export type FacultyTeachingScopeInput = {
  academicYearId: string
  studyYear: number
  sectionId: string
  effectiveFrom: string
  effectiveTo?: string
  isActive: boolean
}

export type ProvisionAccountInput = {
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
  teachingScopes?: FacultyTeachingScopeInput[]
  responsibilities?: FacultyResponsibility[]
}

export type ManagedProfileUpdate = Pick<Database['public']['Tables']['profiles']['Update'], 'full_name' | 'department_id' | 'section_id' | 'phone' | 'designation' | 'faculty_responsibilities'>

const client = () => {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

const fail = (error: { message: string; code?: string } | null, fallback: string) => {
  if (error) throw new Error(readableSupabaseError(error, 'user management', fallback))
}

async function provisioningErrorMessage(error: unknown) {
  const context = error && typeof error === 'object' && 'context' in error ? error.context : null
  if (context instanceof Response) {
    const payload = await context.clone().json().catch(() => null) as { error?: unknown; message?: unknown } | null
    const remoteMessage = typeof payload?.error === 'string' ? payload.error : typeof payload?.message === 'string' ? payload.message : null
    if (context.status === 404) return 'Account provisioning is not available because the admin-create-user service has not been deployed.'
    if (remoteMessage) return remoteMessage
  }
  if (error instanceof Error && /fetch|network/i.test(error.message)) return 'Unable to reach the account provisioning service. Check the Supabase connection and try again.'
  return 'Unable to provision the account. Please try again.'
}

export const userProvisioningService = {
  async createAccount(input: ProvisionAccountInput) {
    const { data, error } = await client().functions.invoke('admin-create-user', { body: input })
    if (error) throw new Error(await provisioningErrorMessage(error))
    return data as { id: string; fullName: string; role: AppRole; status: 'active' }
  },
  async updateProfile(id: string, value: ManagedProfileUpdate) {
    const { error } = await client().from('profiles').update(value).eq('id', id)
    fail(error, 'Unable to update the profile.')
  },
  async setAccountActive(id: string, isActive: boolean) {
    const { error } = await client().from('profiles').update({ status: isActive ? 'active' : 'inactive' }).eq('id', id)
    fail(error, 'Unable to update the account status.')
  },
}
