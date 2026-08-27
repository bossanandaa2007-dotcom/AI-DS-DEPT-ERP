import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ title = 'Nothing here yet', description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="rounded border border-dashed border-border bg-background/60 p-6 text-center">
    <Inbox aria-hidden="true" className="mx-auto size-7 text-muted" />
    <h2 className="mt-3 text-base font-semibold text-text">{title}</h2>
    {description && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
}
