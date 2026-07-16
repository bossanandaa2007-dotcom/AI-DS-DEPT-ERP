import type { TextareaHTMLAttributes } from 'react'

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted ${className}`} {...props} />
}
