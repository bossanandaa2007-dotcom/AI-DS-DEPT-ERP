import { Activity, ArrowDownRight, ArrowUpRight, Users } from 'lucide-react'

import { Card } from '@/components/ui/Card'
import type { DashboardMetric, DashboardTone } from '@/types'

const toneStyles: Record<DashboardTone, string> = { primary: 'bg-primary/10 text-primary', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', error: 'bg-error/10 text-error', information: 'bg-information/10 text-information' }

export function DashboardMetricGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map((metric, index) => { const Icon = index === 0 ? Users : index === 1 ? Activity : ArrowUpRight; return <Card key={metric.label} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-muted">{metric.label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-text">{metric.value}</p></div><span className={`grid size-10 place-items-center rounded-lg ${toneStyles[metric.tone]}`}><Icon aria-hidden="true" className="size-5" /></span></div><p className="mt-3 flex items-center gap-1 text-sm text-muted">{metric.tone === 'error' ? <ArrowDownRight aria-hidden="true" className="size-3.5" /> : <ArrowUpRight aria-hidden="true" className="size-3.5" />}{metric.detail}</p></Card> })}</div>
}
