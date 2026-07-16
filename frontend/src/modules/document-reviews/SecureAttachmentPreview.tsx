import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Modal } from '@/components/common/Modal'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Button } from '@/components/ui/Button'
import { privateFileRepository, type AttachmentRow } from '@/services/supabase/privateFileRepository'

function PreviewAttempt({ attachment, onRetry }: { attachment: AttachmentRow; onRetry: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void privateFileRepository.createPrivateSignedUrl(attachment)
      .then((value) => { if (active) setUrl(value) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to create the secure preview.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attachment])
  if (loading) return <LoadingState label="Creating a five-minute secure preview…" />
  if (error) return <div className="space-y-4"><ErrorState title="Preview unavailable" description={error} /><Button variant="secondary" onClick={onRetry}><RefreshCw className="size-4" /> Retry secure preview</Button></div>
  if (!url) return <div className="space-y-4"><ErrorState title="Private file missing" description="No preview link was returned. The file may have been removed or access may have changed." /><Button variant="secondary" onClick={onRetry}><RefreshCw className="size-4" /> Retry secure preview</Button></div>
  const image = attachment.mime_type === 'image/jpeg' || attachment.mime_type === 'image/png'
  return image
    ? <img className="max-h-[65vh] w-full rounded-lg object-contain" src={url} alt={attachment.filename} />
    : <div className="space-y-3"><iframe className="h-[65vh] w-full rounded-lg border border-border" src={url} title={attachment.filename} /><a className="text-link text-sm" href={url} target="_blank" rel="noreferrer">Open PDF in a new tab</a><Button variant="secondary" onClick={onRetry}><RefreshCw className="size-4" /> Regenerate expired link</Button></div>
}

export function SecureAttachmentPreview({ attachment, onClose }: { attachment: AttachmentRow; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0)
  return <Modal isOpen title={`Secure preview: ${attachment.filename}`} onClose={onClose}><PreviewAttempt key={attempt} attachment={attachment} onRetry={() => setAttempt((value) => value + 1)} /></Modal>
}
