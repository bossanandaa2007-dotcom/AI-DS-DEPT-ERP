import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { DashboardQuickAction } from '@/types'

export function DashboardQuickActions({ actions }: { actions: DashboardQuickAction[] }) {
  return <section>
    <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Quick actions</h2>
    <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {actions.map((action) => <Link key={action.label} to={action.path} className="group rounded border border-border bg-surface p-3 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-secondary hover:bg-background hover:shadow-md active:translate-y-0 active:shadow-sm">
        <p className="flex items-center justify-between gap-2 text-sm font-bold text-text">{action.label}<ArrowRight aria-hidden="true" className="size-4 shrink-0 text-secondary transition-transform group-hover:translate-x-0.5" /></p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{action.description}</p>
      </Link>)}
    </div>
  </section>
}
