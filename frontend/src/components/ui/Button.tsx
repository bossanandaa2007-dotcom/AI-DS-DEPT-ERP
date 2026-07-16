import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-secondary',
  secondary: 'border border-border bg-surface text-text hover:bg-background',
  ghost: 'text-muted hover:bg-background hover:text-text',
  danger: 'bg-error text-primary-foreground hover:opacity-90',
}

export function Button({ className = '', variant = 'primary', type = 'button', ...props }: ButtonProps) {
  return <button className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`} type={type} {...props} />
}
