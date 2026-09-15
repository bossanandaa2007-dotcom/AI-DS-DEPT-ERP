import type { TextareaHTMLAttributes } from 'react'

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-28 w-full rounded border border-border bg-surface px-3 py-2.5 text-sm text-text shadow-sm transition duration-150 placeholder:text-muted focus:border-information focus:outline-none focus:ring-2 focus:ring-information/20 ${className}`} {...props} />
}
