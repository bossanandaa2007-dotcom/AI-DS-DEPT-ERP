import type { ReactNode } from 'react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/Button'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function ConfirmDialog({ isOpen, title, description, confirmLabel = 'Confirm', onConfirm, onCancel, children }: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onCancel])
  if (!isOpen) return null
  return <div aria-modal="true" role="dialog" aria-labelledby="confirm-dialog-title" className="overlay-in fixed inset-0 z-50 flex items-end bg-text/40 p-0 sm:items-center sm:justify-center sm:p-4">
    <div className="dialog-panel-in w-full rounded-t bg-surface p-4 shadow-xl sm:max-w-md sm:rounded sm:p-6">
      <h2 id="confirm-dialog-title" className="text-lg font-bold text-text">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      {children}
      <div className="mt-6 grid gap-3 sm:flex sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  </div>
}
