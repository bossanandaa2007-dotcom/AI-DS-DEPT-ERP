import type { PropsWithChildren } from 'react'

import { AuthProvider } from '@/modules/auth/AuthProvider'

/** Reserved for application-wide providers as the ERP grows. */
export function AppProviders({ children }: PropsWithChildren) {
  return <AuthProvider>{children}</AuthProvider>
}
