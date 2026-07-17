import { useCallback } from 'react'
import type { PropsWithChildren } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { ROUTE_PATHS } from '@/app/router/route-paths'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { getDefaultRouteForRole, hasRole } from '@/lib/auth'
import { useAuth } from '@/modules/auth/useAuth'
import { documentReviewRepository } from '@/services/supabase/documentReviewRepository'

export function HomeRedirect() {
  const { currentUser, isRestoring, restorationError, retrySessionRestore } = useAuth()
  if (isRestoring) return <LoadingState label="Restoring session…" />
  if (restorationError) return <AuthRestoreError message={restorationError} onRetry={retrySessionRestore} />
  return <Navigate replace to={currentUser ? getDefaultRouteForRole(currentUser.role) : ROUTE_PATHS.login} />
}

export function ProtectedRoleRoute({ allowedRoles }: PropsWithChildren<{ allowedRoles: readonly import('@/types').UserRole[] }>) {
  const { currentUser, isRestoring, restorationError, retrySessionRestore } = useAuth()
  const location = useLocation()
  if (isRestoring) return <LoadingState label="Restoring session…" />
  if (restorationError) return <AuthRestoreError message={restorationError} onRetry={retrySessionRestore} />
  if (!currentUser) return <Navigate replace to={ROUTE_PATHS.login} state={{ from: location.pathname }} />
  if (!hasRole(currentUser.role, allowedRoles)) return <Navigate replace to={ROUTE_PATHS.unauthorized} />
  return <Outlet />
}

function AuthRestoreError({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return <main className="page-shell"><div className="app-container py-10"><ErrorState title="Profile loading unavailable" description={message} /><Button className="mt-4" onClick={() => void onRetry()}>Retry</Button></div></main>
}

/** Jury is an active Faculty capability, checked from the database before rendering its route. */
export function JuryEligibleRoute() {
  const load = useCallback(() => documentReviewRepository.isCurrentUserJuryEligible(), [])
  const eligibility = useAsyncResource(load)
  if (eligibility.isLoading) return <LoadingState label="Checking Jury eligibility…" />
  if (eligibility.error) return <ErrorState title="Jury access unavailable" description={eligibility.error} />
  if (!eligibility.data) return <Navigate replace to={ROUTE_PATHS.unauthorized} />
  return <Outlet />
}
