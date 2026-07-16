import type { SelectHTMLAttributes } from 'react'

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text ${className}`} {...props} />
}
