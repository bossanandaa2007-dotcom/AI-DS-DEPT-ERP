import type { PropsWithChildren } from 'react'

type BadgeTone = 'primary' | 'success' | 'warning' | 'muted'
const tones: Record<BadgeTone, string> = { primary: 'bg-primary/10 text-primary ring-primary/15', success: 'bg-success/10 text-success ring-success/15', warning: 'bg-warning/10 text-warning ring-warning/15', muted: 'bg-background text-muted ring-border' }

export function Badge({ children, tone = 'muted' }: PropsWithChildren<{ tone?: BadgeTone }>) {
  return <span className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ring-1 ${tones[tone]}`}>{children}</span>
}
