import { useCallback } from 'react'

import { PageHeader } from '@/components/common/PageHeader'
import { DashboardMetricGrid } from '@/components/dashboard/DashboardMetricGrid'
import { DashboardQuickActions } from '@/components/dashboard/DashboardQuickActions'
import { DashboardSectionCard } from '@/components/dashboard/DashboardSectionCard'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Button } from '@/components/ui/Button'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { reportingRepository } from '@/services/supabase/reportingRepository'

export function RoleDashboardPage() {
  const load = useCallback(() => reportingRepository.load(), [])
  const resource = useAsyncResource(load)
  if (resource.isLoading) return <LoadingState label="Loading your live dashboard…" />
  if (resource.error || !resource.data) return <div className="space-y-3"><ErrorState title="Dashboard unavailable" description={resource.error ?? 'No reporting data was returned.'} /><Button variant="secondary" onClick={() => void resource.reload()}>Retry</Button></div>
  const dashboard = reportingRepository.dashboard(resource.data)
  return <div className="space-y-6"><PageHeader title={dashboard.title} description={dashboard.description} /><DashboardMetricGrid metrics={dashboard.metrics} />{dashboard.quickActions && <DashboardQuickActions actions={dashboard.quickActions} />}<div className="grid gap-5 xl:grid-cols-2">{dashboard.sections.map((section) => <DashboardSectionCard key={section.title} section={section} />)}</div></div>
}
