import type { UserRole } from '@/types/auth.types'

export type DashboardTone = 'primary' | 'success' | 'warning' | 'error' | 'information'
export type DashboardSectionKind = 'list' | 'progress' | 'schedule' | 'status'

export interface DashboardMetric {
  label: string
  value: string
  detail: string
  tone: DashboardTone
}

export interface DashboardItem {
  title: string
  detail?: string
  value?: string
  progress?: number
  tone?: DashboardTone
}

export interface DashboardSection {
  title: string
  description?: string
  kind: DashboardSectionKind
  items: DashboardItem[]
  emptyTitle?: string
  emptyDescription?: string
}

export interface DashboardQuickAction {
  label: string
  description: string
  path: string
}

export interface RoleDashboardData {
  role: UserRole
  title: string
  description: string
  metrics: DashboardMetric[]
  sections: DashboardSection[]
  quickActions?: DashboardQuickAction[]
}
