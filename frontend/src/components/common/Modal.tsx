import type { PropsWithChildren } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/Button'

export function Modal({ isOpen, title, onClose, children }: PropsWithChildren<{ isOpen: boolean; title: string; onClose: () => void }>) {
  if (!isOpen) return null
  return <div aria-modal="true" role="dialog" aria-labelledby="modal-title" className="fixed inset-0 z-50 grid place-items-center bg-text/40 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-surface p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><h2 id="modal-title" className="text-lg font-bold text-text">{title}</h2><Button aria-label="Close dialog" className="px-2" variant="ghost" onClick={onClose}><X className="size-5" /></Button></div><div className="mt-5">{children}</div></div></div>
}
