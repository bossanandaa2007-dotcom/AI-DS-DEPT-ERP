import { Bell, CircleDot } from 'lucide-react'

import { EmptyState } from '@/components/feedback/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { DashboardItem } from '@/types'

const toneToBadge = (tone: DashboardItem['tone']): 'primary' | 'success' | 'warning' | 'muted' => {
  if (tone === 'success') return 'success'
  if (tone === 'warning' || tone === 'error') return 'warning'
  if (tone === 'information' || tone === 'primary') return 'primary'
  return 'muted'
}

export function DashboardActivityFeed({ items }: { items: DashboardItem[] }) {
  return <Card>
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded bg-secondary/10 text-secondary"><Bell aria-hidden="true" className="size-4" /></span>
      <div>
        <h2 className="font-bold text-text">Recent activity</h2>
        <p className="text-sm text-muted">Updates from your visible academic workflows.</p>
      </div>
    </div>
    {items.length === 0
      ? <div className="mt-4"><EmptyState title="No recent activity" description="Relevant announcements, requests, reviews, and audit updates appear here." /></div>
      : <ol className="mt-4 space-y-3">
        {items.slice(0, 8).map((item, index) => <li key={`${index}-${item.title}-${item.value ?? ''}`} className="flex gap-3">
          <CircleDot aria-hidden="true" className="mt-1 size-4 shrink-0 text-secondary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold text-text">{item.title}</p>
              {item.value && <Badge tone={toneToBadge(item.tone)}>{item.value}</Badge>}
            </div>
            {item.detail && <p className="mt-0.5 text-sm leading-5 text-muted">{item.detail}</p>}
          </div>
        </li>)}
      </ol>}
  </Card>
}
