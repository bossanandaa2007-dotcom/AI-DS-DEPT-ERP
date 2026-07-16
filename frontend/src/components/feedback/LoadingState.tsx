export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div aria-live="polite" className="flex min-h-40 items-center justify-center text-sm font-medium text-muted">{label}</div>
}
