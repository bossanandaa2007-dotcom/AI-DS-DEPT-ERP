import type { InputHTMLAttributes } from 'react'

/**
 * Note on padding overrides: Tailwind sorts a utility family as strings, so `.px-12` is emitted
 * before `.px-3` and the `px-3` below would win. Override horizontal padding with `pl-*`/`pr-*`,
 * which are emitted after the `px-*` group and therefore apply.
 */
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`min-h-10 w-full rounded border border-border bg-surface px-3 text-sm text-text shadow-sm transition duration-150 placeholder:text-muted focus:border-information focus:outline-none focus:ring-2 focus:ring-information/20 sm:min-h-11 ${className}`} {...props} />
}
