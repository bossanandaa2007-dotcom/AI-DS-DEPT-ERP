import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return <header className="mb-4 flex flex-col gap-3 sm:mb-5 lg:flex-row lg:items-start lg:justify-between">
    <div className="min-w-0">
      <h1 className="text-balance text-xl font-bold tracking-tight text-text sm:text-2xl lg:text-3xl">{title}</h1>
      {description && <p className="mt-1 text-sm leading-5 text-muted sm:leading-6">{description}</p>}
    </div>
    {actions && <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">{actions}</div>}
  </header>
}
