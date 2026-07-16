import type { LucideIcon } from 'lucide-react'

import type { UserRole } from '@/types/auth.types'

export interface NavigationItem {
  label: string
  path: string
  icon?: LucideIcon
  allowedRoles?: UserRole[]
}
