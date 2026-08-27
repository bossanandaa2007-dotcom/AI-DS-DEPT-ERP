import type { PropsWithChildren } from 'react'
import { useEffect } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/Button'

export function Modal({ isOpen, title, onClose, children }: PropsWithChildren<{ isOpen: boolean; title: string; onClose: () => void }>) {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])
  if (!isOpen) return null
  return <div aria-modal="true" role="dialog" aria-labelledby="modal-title" className="overlay-in fixed inset-0 z-50 flex items-end bg-text/40 p-0 sm:items-center sm:justify-center sm:p-4">
    <div className="dialog-panel-in max-h-[92svh] w-full overflow-y-auto rounded-t bg-surface p-4 shadow-xl sm:max-w-xl sm:rounded sm:p-6">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:static sm:-mx-6 sm:-mt-6 sm:px-6">
        <h2 id="modal-title" className="min-w-0 text-lg font-bold text-text">{title}</h2>
        <Button aria-label="Close dialog" className="min-h-9 px-2" variant="ghost" onClick={onClose}><X className="size-5" /></Button>
      </div>
      <div className="mt-5 pb-[max(env(safe-area-inset-bottom),0px)]">{children}</div>
    </div>
  </div>
}
