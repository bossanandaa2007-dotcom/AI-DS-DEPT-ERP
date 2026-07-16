import type { InputHTMLAttributes } from 'react'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted ${className}`} {...props} />
}
