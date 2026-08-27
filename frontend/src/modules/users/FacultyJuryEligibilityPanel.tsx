import { RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react'
import { useCallback, useState } from 'react'

import { DataTable } from '@/components/common/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { academicRepository } from '@/services/supabase/academicRepository'

export function FacultyJuryEligibilityPanel() {
  const { currentUser } = useAuth()
  const load = useCallback(() => academicRepository.loadAcademicData(), [])
  const resource = useAsyncResource(load, 'academicData')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  if (!currentUser || currentUser.role !== 'super_admin') return null
  if (resource.isLoading) return <LoadingState label="Loading Faculty Jury eligibility…" />
  if (resource.error) return <ErrorState title="Unable to load Jury eligibility" description={resource.error} />
  const data = resource.data
  if (!data) return null
  const faculty = data.profiles.filter((profile) => profile.role === 'faculty')
  const eligible = (id: string) => data.assignments.some((assignment) => assignment.faculty_id === id && assignment.is_active && assignment.is_jury_eligible)
  const hasAssignment = (id: string) => data.assignments.some((assignment) => assignment.faculty_id === id && assignment.is_active)
  const update = async (id: string, value: boolean) => {
    setSavingId(id); setMessage('')
    try { await academicRepository.setFacultyJuryEligibility(id, value); await resource.reload(); setMessage(`Jury eligibility ${value ? 'enabled' : 'disabled'}.`) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update Jury eligibility.') } finally { setSavingId(null) }
  }
  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-text">Faculty Jury eligibility</h2><p className="mt-1 text-sm text-muted">Eligibility is stored on active Faculty assignments and immediately feeds Jury review access.</p></div><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button></div>{message && <p role={message.includes('enabled') || message.includes('disabled') ? 'status' : 'alert'} className={`mt-3 text-sm ${message.includes('enabled') || message.includes('disabled') ? 'text-success' : 'text-error'}`}>{message}</p>}<div className="mt-4"><DataTable rows={faculty} empty={<EmptyState title="No Faculty profiles found" />} columns={[{ header: 'Faculty', render: (profile) => <div><p className="font-semibold">{profile.full_name}</p><p className="text-xs text-muted">{profile.employee_or_register_number ?? profile.email}</p></div> }, { header: 'Status', render: (profile) => <Badge tone={profile.status === 'active' ? 'success' : 'muted'}>{profile.status}</Badge> }, { header: 'Assignment', render: (profile) => hasAssignment(profile.id) ? 'Active assignment available' : 'No active assignment' }, { header: 'Jury', render: (profile) => <Badge tone={eligible(profile.id) ? 'success' : 'muted'}>{eligible(profile.id) ? 'Eligible' : 'Not eligible'}</Badge> }, { header: 'Action', render: (profile) => eligible(profile.id) ? <Button variant="secondary" disabled={savingId === profile.id} onClick={() => void update(profile.id, false)}><ShieldOff className="size-4" /> Disable</Button> : <Button disabled={savingId === profile.id || profile.status !== 'active' || !hasAssignment(profile.id)} onClick={() => void update(profile.id, true)}><ShieldCheck className="size-4" /> Enable</Button> }]} /></div></Card>
}
