import type { InputHTMLAttributes } from 'react'

/**
 * Note on padding overrides: Tailwind sorts a utility family as strings, so `.px-12` is emitted
 * before `.px-3` and the `px-3` below would win. Override horizontal padding with `pl-*`/`pr-*`,
 * which are emitted after the `px-*` group and therefore apply.
 */
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted ${className}`} {...props} />
}
