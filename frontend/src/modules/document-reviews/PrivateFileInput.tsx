import { FileCheck2 } from 'lucide-react'

import { Input } from '@/components/ui/Input'
import { PRIVATE_FILE_MIME_TYPES, validatePrivateFile } from '@/services/supabase/privateFileRepository'

export function PrivateFileInput({ label, file, onFile, onError, disabled = false }: {
  label: string
  file: File | null
  onFile: (file: File | null) => void
  onError: (message: string) => void
  disabled?: boolean
}) {
  const select = (selected: File | null) => {
    onError('')
    if (!selected) { onFile(null); return }
    try {
      validatePrivateFile(selected)
      onFile(selected)
    } catch (error) {
      onFile(null)
      onError(error instanceof Error ? error.message : 'The selected file is invalid.')
    }
  }
  return <label className="block text-sm font-semibold">{label} <span className="font-normal text-muted">(PDF/JPEG/PNG, maximum exactly 1 MB)</span><Input className="mt-1" type="file" accept={PRIVATE_FILE_MIME_TYPES.join(',')} disabled={disabled} onChange={(event) => select(event.target.files?.[0] ?? null)} />{file && <span className="mt-2 flex items-center gap-1 text-xs font-normal text-success"><FileCheck2 className="size-3" /> Validated: {file.name}</span>}</label>
}
