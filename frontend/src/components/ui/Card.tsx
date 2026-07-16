import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-xl border border-border bg-surface p-5 shadow-sm ${className}`} {...props} />
}
