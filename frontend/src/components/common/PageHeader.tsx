import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">{title}</h1>
      {description && <p className="mt-1 text-sm leading-6 text-muted">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </header>
}
