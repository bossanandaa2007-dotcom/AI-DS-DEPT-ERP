import { Inbox } from 'lucide-react'

export function EmptyState({ title = 'Nothing here yet', description }: { title?: string; description?: string }) {
  return <div className="rounded-xl border border-dashed border-border p-8 text-center"><Inbox aria-hidden="true" className="mx-auto size-7 text-muted" /><h2 className="mt-3 font-semibold text-text">{title}</h2>{description && <p className="mt-1 text-sm text-muted">{description}</p>}</div>
}
