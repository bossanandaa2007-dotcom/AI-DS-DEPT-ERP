import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/types'

type ProfileRow = { id: string; full_name: string; email: string; role: AppUser['role']; status: AppUser['status']; avatar_url: string | null; faculty_responsibilities: AppUser['facultyResponsibilities'] | null }
export type LoginPortal = 'staff' | 'student'
type AuthFailureCode = 'network' | 'invalid_credentials' | 'missing_profile' | 'inactive_profile' | 'wrong_portal' | 'profile_forbidden' | 'profile_loading' | 'session_loading'

export class AuthServiceError extends Error {
  readonly code: AuthFailureCode

  constructor(code: AuthFailureCode, message: string) {
    super(message)
    this.code = code
  }
}

const client = () => { if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'); return supabase }
const toAppUser = (profile: ProfileRow): AppUser => ({ id: profile.id, name: profile.full_name, email: profile.email, role: profile.role, status: profile.status, avatarUrl: profile.avatar_url ?? undefined, facultyResponsibilities: profile.faculty_responsibilities ?? undefined })
const isStaffRole = (role: AppUser['role']) => role === 'super_admin' || role === 'hod' || role === 'faculty' || role === 'lab_assistant'

const NETWORK_ERROR_MESSAGE = 'Unable to connect to Supabase. Check your internet connection and try again.'

function isNetworkFailure(error: { message?: string; name?: string; status?: number } | null | undefined) {
  return error?.name === 'AuthRetryableFetchError' || error?.status === 0 || /fetch|network|networkerror|failed to fetch|load failed|timeout/i.test(error?.message ?? '')
}

function isForbidden(error: { status?: number; code?: string; message?: string } | null | undefined) {
  return error?.status === 401 || error?.status === 403 || error?.code === '42501' || /permission denied|not authorized|forbidden/i.test(error?.message ?? '')
}

async function loadProfile(userId: string): Promise<AppUser> {
  const { data, error } = await client().from('profiles').select('id, full_name, email, role, status, avatar_url, faculty_responsibilities').eq('id', userId).maybeSingle()
  if (error && isNetworkFailure(error)) throw new AuthServiceError('network', NETWORK_ERROR_MESSAGE)
  if (error && isForbidden(error)) throw new AuthServiceError('profile_forbidden', 'Your ERP profile could not be accessed. Contact the administrator.')
  if (error) throw new AuthServiceError('profile_loading', 'Unable to load your ERP profile. Please try again.')
  if (!data) throw new AuthServiceError('missing_profile', 'Your Auth account exists, but its ERP profile is missing.')
  return toAppUser(data as ProfileRow)
}

function portalMessage(role: AppUser['role'], portal: LoginPortal) {
  if (portal === 'staff' && role === 'student') return 'Student accounts must use the Student Login page.'
  if (portal === 'student' && isStaffRole(role)) return 'Staff and administrator accounts must use the Staff Login page.'
  return 'This account is not permitted to use the selected login page.'
}

async function signOutSilently() {
  try { await client().auth.signOut() } catch { /* Preserve the original profile or portal error. */ }
}

export const supabaseAuthService = {
  async getCurrentUser(): Promise<AppUser | null> {
    const auth = client()
    const { data: sessionData, error: sessionError } = await auth.auth.getSession()
    if (sessionError) throw new AuthServiceError(isNetworkFailure(sessionError) ? 'network' : 'session_loading', isNetworkFailure(sessionError) ? NETWORK_ERROR_MESSAGE : 'Unable to restore your session. Please try again.')
    if (!sessionData.session) return null
    const { data: userData, error: userError } = await auth.auth.getUser()
    if (userError) throw new AuthServiceError(isNetworkFailure(userError) ? 'network' : 'session_loading', isNetworkFailure(userError) ? NETWORK_ERROR_MESSAGE : 'Unable to verify your session. Please try again.')
    if (!userData.user) return null
    return loadProfile(userData.user.id)
  },
  async login(email: string, password: string, portal: LoginPortal): Promise<AppUser> {
    const auth = client()
    const { data, error } = await auth.auth.signInWithPassword({ email, password })
    if (error) {
      if (isNetworkFailure(error)) throw new AuthServiceError('network', NETWORK_ERROR_MESSAGE)
      if (/invalid login credentials|invalid.*password|email not confirmed/i.test(error.message)) throw new AuthServiceError('invalid_credentials', 'Invalid email or password.')
      throw new AuthServiceError('session_loading', 'Unable to sign in. Please try again.')
    }
    if (!data.user || !data.session) throw new AuthServiceError('session_loading', 'Sign-in did not return an authenticated session. Please try again.')
    const user = await loadProfile(data.user.id)
    if (user.status !== 'active') {
      await signOutSilently()
      throw new AuthServiceError('inactive_profile', 'Your account is inactive. Contact the administrator.')
    }
    if ((portal === 'staff' && !isStaffRole(user.role)) || (portal === 'student' && user.role !== 'student')) {
      await signOutSilently()
      throw new AuthServiceError('wrong_portal', portalMessage(user.role, portal))
    }
    return user
  },
  async logout() { const { error } = await client().auth.signOut(); if (error) throw error },
  onAuthStateChange(callback: (event: string) => void) { return client().auth.onAuthStateChange((event) => callback(event)) },
}
