import type { PropsWithChildren } from 'react'

type BadgeTone = 'primary' | 'success' | 'warning' | 'muted'
const tones: Record<BadgeTone, string> = { primary: 'bg-primary/10 text-primary', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', muted: 'bg-background text-muted' }

export function Badge({ children, tone = 'muted' }: PropsWithChildren<{ tone?: BadgeTone }>) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}
