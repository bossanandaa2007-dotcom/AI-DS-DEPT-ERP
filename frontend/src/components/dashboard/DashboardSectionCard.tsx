import { CalendarClock, CheckCircle2, ListTodo, TrendingUp } from 'lucide-react'

import { EmptyState } from '@/components/feedback/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { DashboardSection, DashboardTone } from '@/types'

const toneClasses: Record<DashboardTone, string> = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', error: 'bg-error', information: 'bg-information' }
const badgeTones: Record<DashboardTone, 'primary' | 'success' | 'warning' | 'muted'> = { primary: 'primary', success: 'success', warning: 'warning', error: 'warning', information: 'primary' }
const icons = { list: ListTodo, progress: TrendingUp, schedule: CalendarClock, status: CheckCircle2 }

export function DashboardSectionCard({ section }: { section: DashboardSection }) {
  const Icon = icons[section.kind]
  return <Card className="h-full"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-4" /></span><div><h2 className="font-bold text-text">{section.title}</h2>{section.description && <p className="mt-0.5 text-sm text-muted">{section.description}</p>}</div></div>{section.items.length === 0 ? <div className="mt-5"><EmptyState title={section.emptyTitle} description={section.emptyDescription} /></div> : <ul className="mt-5 divide-y divide-border">{/* Title and detail do not identify a row: "Today's timetable" repeats a subject in the same
     room when a class runs two periods back to back, so the position is part of the key. These
     lists are read-only and never reordered, so the index is stable for a given render. */}
{section.items.map((item, index) => <li key={`${index}-${item.title}-${item.detail ?? ''}`} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-text">{item.title}</p>{item.detail && <p className="mt-0.5 text-sm leading-5 text-muted">{item.detail}</p>}</div>{item.value && section.kind !== 'progress' && <Badge tone={badgeTones[item.tone ?? 'primary']}>{item.value}</Badge>}</div>{section.kind === 'progress' && <div className="mt-3"><div className="flex justify-between gap-3 text-xs font-semibold text-muted"><span>Completion</span><span>{item.value ?? `${item.progress ?? 0}%`}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background"><div aria-label={`${item.title} progress`} className={`h-full rounded-full ${toneClasses[item.tone ?? 'primary']}`} style={{ width: `${item.progress ?? 0}%` }} /></div></div>}</li>)}</ul>}</Card>
}
