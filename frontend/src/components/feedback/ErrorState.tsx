import { CircleAlert } from 'lucide-react'

export function ErrorState({ title = 'Something went wrong', description }: { title?: string; description?: string }) {
  return <div role="alert" className="rounded border border-error/30 bg-error/5 p-4 sm:p-5">
    <CircleAlert aria-hidden="true" className="size-6 text-error" />
    <h2 className="mt-2 text-base font-semibold text-text">{title}</h2>
    {description && <p className="mt-1 text-sm leading-6 text-muted">{description}</p>}
  </div>
}
