import { Activity, ArrowDownRight, ArrowUpRight, Users } from 'lucide-react'

import { Card } from '@/components/ui/Card'
import type { DashboardMetric, DashboardTone } from '@/types'

const toneStyles: Record<DashboardTone, string> = { primary: 'bg-primary/10 text-primary', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', error: 'bg-error/10 text-error', information: 'bg-information/10 text-information' }

export function DashboardMetricGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{metrics.map((metric, index) => { const Icon = index === 0 ? Users : index === 1 ? Activity : ArrowUpRight; return <Card key={metric.label} className="p-3 sm:p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="line-clamp-2 text-xs font-bold uppercase leading-tight tracking-wide text-muted">{metric.label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-text sm:text-3xl">{metric.value}</p></div><span className={`grid size-8 shrink-0 place-items-center rounded ${toneStyles[metric.tone]}`}><Icon aria-hidden="true" className="size-4" /></span></div><p className="mt-2 flex items-center gap-1 text-xs leading-5 text-muted sm:text-sm">{metric.tone === 'error' ? <ArrowDownRight aria-hidden="true" className="size-3.5 shrink-0" /> : <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />}{metric.detail}</p></Card> })}</div>
}
