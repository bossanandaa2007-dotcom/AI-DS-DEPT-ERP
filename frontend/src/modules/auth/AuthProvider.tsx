import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { supabaseAuthService } from '@/services/supabase/authService'
import type { AppUser } from '@/types'

interface AuthContextValue {
  currentUser: AppUser | null
  isRestoring: boolean
  login: (userId: string, password: string, portal: import('@/services/supabase/authService').LoginPortal) => Promise<AppUser>
  logout: () => Promise<void>
  restorationError: string | null
  retrySessionRestore: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const [restorationError, setRestorationError] = useState<string | null>(null)
  const mounted = useRef(true)
  const restoreVersion = useRef(0)
  const loginInProgress = useRef(false)

  const restoreSession = useCallback(async () => {
    const version = ++restoreVersion.current
    setIsRestoring(true)
    try {
      const user = await supabaseAuthService.getCurrentUser()
      if (!mounted.current || version !== restoreVersion.current) return
      if (user?.status !== 'active') {
        await supabaseAuthService.logout()
        if (!mounted.current || version !== restoreVersion.current) return
        setCurrentUser(null)
        setRestorationError(null)
        return
      }
      setCurrentUser(user)
      setRestorationError(null)
    } catch (error) {
      if (!mounted.current || version !== restoreVersion.current) return
      // Keep the Auth session intact for profile, RLS, and connectivity failures so
      // a transient failure never becomes a logout/redirect loop.
      setRestorationError(error instanceof Error ? error.message : 'Unable to restore your profile. Please try again.')
    } finally {
      if (mounted.current && version === restoreVersion.current) setIsRestoring(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const restoreTimer = window.setTimeout(() => { void restoreSession() }, 0)
    let unsubscribe: () => void = () => {}
    try {
      const { data } = supabaseAuthService.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          setCurrentUser(null)
          setRestorationError(null)
          setIsRestoring(false)
          return
        }
        if (loginInProgress.current) return
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') void restoreSession()
      })
      unsubscribe = () => data.subscription.unsubscribe()
    } catch { /* The scheduled restore reports Supabase configuration failures. */ }
    return () => { window.clearTimeout(restoreTimer); mounted.current = false; unsubscribe() }
  }, [restoreSession])
  const login = useCallback(async (userId: string, password: string, portal: import('@/services/supabase/authService').LoginPortal) => {
    loginInProgress.current = true
    try {
      const user = await supabaseAuthService.login(userId, password, portal)
      setCurrentUser(user)
      setRestorationError(null)
      return user
    } finally {
      loginInProgress.current = false
    }
  }, [])
  const logout = useCallback(async () => {
    await supabaseAuthService.logout()
    setCurrentUser(null)
    setRestorationError(null)
  }, [])
  const value = useMemo(() => ({ currentUser, isRestoring, login, logout, restorationError, retrySessionRestore: restoreSession }), [currentUser, isRestoring, login, logout, restorationError, restoreSession])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
