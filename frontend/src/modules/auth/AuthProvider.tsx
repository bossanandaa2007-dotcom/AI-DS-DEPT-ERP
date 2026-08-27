import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { clearAllCaches } from '@/lib/data-cache'
import { supabaseAuthService } from '@/services/supabase/authService'
import type { AppUser } from '@/types'

interface AuthContextValue {
  currentUser: AppUser | null
  isRestoring: boolean
  login: (email: string, password: string) => Promise<AppUser>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  useEffect(() => {
    let mounted = true
    const restore = async () => { try { const user = await supabaseAuthService.getCurrentUser(); if (mounted) setCurrentUser(user) } catch { if (mounted) { clearAllCaches(); setCurrentUser(null) } } finally { if (mounted) setIsRestoring(false) } }
    void restore()
    let unsubscribe: () => void = () => {}
    try { const { data } = supabaseAuthService.onAuthStateChange(() => { void restore() }); unsubscribe = () => data.subscription.unsubscribe() } catch { /* Configuration errors are displayed on login. */ }
    return () => { mounted = false; unsubscribe() }
  }, [])
  const login = useCallback(async (email: string, password: string) => { clearAllCaches(); const user = await supabaseAuthService.login(email, password); setCurrentUser(user); return user }, [])
  const logout = useCallback(async () => { await supabaseAuthService.logout(); clearAllCaches(); setCurrentUser(null) }, [])
  const value = useMemo(() => ({ currentUser, isRestoring, login, logout }), [currentUser, isRestoring, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
