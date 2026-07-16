import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/ui/Card'
import type { DashboardQuickAction } from '@/types'

export function DashboardQuickActions({ actions }: { actions: DashboardQuickAction[] }) {
  return <Card><h2 className="font-bold text-text">Quick actions</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{actions.map((action) => <Link key={action.label} to={action.path} className="group rounded-lg border border-border p-4 transition-colors hover:border-secondary hover:bg-background"><p className="flex items-center justify-between gap-2 font-semibold text-text">{action.label}<ArrowRight aria-hidden="true" className="size-4 text-secondary transition-transform group-hover:translate-x-0.5" /></p><p className="mt-1 text-sm text-muted">{action.description}</p></Link>)}</div></Card>
}
