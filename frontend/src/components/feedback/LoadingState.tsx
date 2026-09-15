export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div aria-live="polite" className="space-y-3 py-6">
    <div className="skeleton-block h-4 w-36 rounded" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((item) => <div key={item} className="rounded border border-border bg-surface p-4 shadow-sm">
        <div className="skeleton-block h-3 w-24 rounded" />
        <div className="skeleton-block mt-4 h-8 w-20 rounded" />
        <div className="skeleton-block mt-4 h-3 w-full rounded" />
      </div>)}
    </div>
    <p className="sr-only">{label}</p>
  </div>
}
