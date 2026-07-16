import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/types'

type ProfileRow = { id: string; full_name: string; email: string; role: AppUser['role']; status: AppUser['status']; avatar_url: string | null; faculty_responsibilities: AppUser['facultyResponsibilities'] | null }
const client = () => { if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'); return supabase }
const toAppUser = (profile: ProfileRow): AppUser => ({ id: profile.id, name: profile.full_name, email: profile.email, role: profile.role, status: profile.status, avatarUrl: profile.avatar_url ?? undefined, facultyResponsibilities: profile.faculty_responsibilities ?? undefined })

export const supabaseAuthService = {
  async getCurrentUser(): Promise<AppUser | null> { const auth = client(); const { data: { user }, error } = await auth.auth.getUser(); if (error) throw error; if (!user) return null; const { data, error: profileError } = await auth.from('profiles').select('id, full_name, email, role, status, avatar_url, faculty_responsibilities').eq('id', user.id).single(); if (profileError) throw profileError; return toAppUser(data as ProfileRow) },
  async login(email: string, password: string): Promise<AppUser> { const auth = client(); const { data, error } = await auth.auth.signInWithPassword({ email, password }); if (error) throw error; if (!data.user) throw new Error('Sign-in did not return a user.'); const user = await this.getCurrentUser(); if (!user) throw new Error('Your profile is not available yet. Contact the administrator.'); if (user.status !== 'active') { await auth.auth.signOut(); throw new Error('This account is not active.') } return user },
  async logout() { const { error } = await client().auth.signOut(); if (error) throw error },
  onAuthStateChange(callback: () => void) { return client().auth.onAuthStateChange(() => callback()) },
}
