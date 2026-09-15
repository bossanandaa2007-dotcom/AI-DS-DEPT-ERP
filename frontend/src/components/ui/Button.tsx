import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-secondary hover:shadow-md active:translate-y-px active:shadow-sm',
  secondary: 'border border-border bg-surface text-text shadow-sm hover:bg-background hover:shadow-md active:translate-y-px active:shadow-sm',
  ghost: 'text-muted hover:bg-background hover:text-text active:translate-y-px',
  danger: 'bg-error text-primary-foreground shadow-sm hover:opacity-90 hover:shadow-md active:translate-y-px active:shadow-sm',
}

export function Button({ className = '', variant = 'primary', type = 'button', ...props }: ButtonProps) {
  return <button className={`inline-flex min-h-10 touch-manipulation items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition duration-150 sm:min-h-11 sm:px-4 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`} type={type} {...props} />
}
