import type { ReactNode } from 'react'

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
  if (!isOpen) return null
  return <div aria-modal="true" role="dialog" aria-labelledby="confirm-dialog-title" className="fixed inset-0 z-50 grid place-items-center bg-text/40 p-4"><div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl"><h2 id="confirm-dialog-title" className="text-lg font-bold text-text">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{description}</p>{children}<div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button></div></div></div>
}
