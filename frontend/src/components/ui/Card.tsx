import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded border border-border/80 bg-surface p-3 shadow-sm sm:p-4 ${className}`} {...props} />
}
