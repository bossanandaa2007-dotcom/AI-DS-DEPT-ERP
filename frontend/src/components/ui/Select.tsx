import type { SelectHTMLAttributes } from 'react'

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`min-h-10 w-full rounded border border-border bg-surface px-3 text-sm text-text shadow-sm transition duration-150 focus:border-information focus:outline-none focus:ring-2 focus:ring-information/20 sm:min-h-11 ${className}`} {...props} />
}
