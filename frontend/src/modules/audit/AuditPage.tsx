import { useCallback, useState } from 'react'

import { DataTable } from '@/components/common/DataTable'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { departmentOperationsRepository } from '@/services/supabase/departmentOperationsRepository'
import type { Json } from '@/types/database.types'

const safeKeys = new Set(['password', 'token', 'secret', 'authorization', 'access_token', 'refresh_token'])
const safeMetadata = (value: Json | null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Recorded system action'
  const entries = Object.entries(value).filter(([key]) => !safeKeys.has(key.toLowerCase())).slice(0, 4)
  if (!entries.length) return 'Recorded system action'
  return entries.map(([key, item]) => `${key}: ${typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ? String(item) : '[protected structured data]'}`).join(' · ')
}
const actionTone = (action: string): 'primary' | 'success' | 'warning' | 'muted' => /final|approve|resolve/i.test(action) ? 'success' : /reject|delete|lock/i.test(action) ? 'warning' : 'primary'

export function AuditPage() {
  const load = useCallback(() => departmentOperationsRepository.loadAudit(), [])
  const resource = useAsyncResource(load)
  const [actorId, setActorId] = useState('all')
  const [action, setAction] = useState('all')
  const [entity, setEntity] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  if (resource.isLoading) return <LoadingState label="Loading audit activity…" />
  if (resource.error || !resource.data) return <div className="space-y-3"><ErrorState title="Audit activity unavailable" description={resource.error ?? 'No audit data was returned.'} /><Button variant="secondary" onClick={() => void resource.reload()}>Retry</Button></div>
  const { records, profiles, context } = resource.data
  const recordActors = new Map(profiles.map((profile) => [profile.id, profile]))
  const actions = [...new Set(records.map((record) => record.action))].sort()
  const entities = [...new Set(records.map((record) => record.module))].sort()
  const filtered = records.filter((record) => (actorId === 'all' || record.actor_id === actorId) && (action === 'all' || record.action === action) && (entity === 'all' || record.module === entity) && (!fromDate || record.created_at >= `${fromDate}T00:00:00`) && (!toDate || record.created_at <= `${toDate}T23:59:59.999Z`))
  const trackingModules = ['academic', 'attendance', 'marks', 'request', 'attachments', 'portion', 'complaint', 'profiles']
  return <div className="space-y-6"><PageHeader title="Audit activity and administrative tracking" description={context.role === 'hod' ? 'Read-only department-scoped activity. Records without a department-identifiable actor are withheld.' : 'Read-only operational activity across accessible departments.'} /><Card><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Select value={actorId} onChange={(event) => setActorId(event.target.value)}><option value="all">All users</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</Select><Select value={action} onChange={(event) => setAction(event.target.value)}><option value="all">All actions</option>{actions.map((item) => <option key={item} value={item}>{item}</option>)}</Select><Select value={entity} onChange={(event) => setEntity(event.target.value)}><option value="all">All entities</option>{entities.map((item) => <option key={item} value={item}>{item}</option>)}</Select><Input type="date" aria-label="From date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /><Input type="date" aria-label="To date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></div></Card><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card><p className="text-sm text-muted">Recorded activity</p><p className="mt-1 text-2xl font-bold text-success">{records.length}</p></Card>{trackingModules.slice(0, 3).map((module) => <Card key={module}><p className="text-sm text-muted capitalize">{module} events</p><p className="mt-1 text-2xl font-bold">{records.filter((record) => record.module === module).length}</p></Card>)}</div><Card><h2 className="font-bold text-text">Operational record trace</h2><p className="mt-1 text-sm text-muted">Academic setup, attendance and marks finalization, requests, document reviews, portion updates, complaints, and profile activity appear when recorded in audit logs.</p><div className="mt-4"><DataTable rows={filtered} empty={<EmptyState title="No audit records match the filters" />} columns={[{ header: 'Actor', render: (item) => { const actor = item.actor_id ? recordActors.get(item.actor_id) : null; return <div><p className="font-semibold">{actor?.full_name ?? 'System'}</p><p className="text-xs text-muted">{item.actor_role ?? actor?.role ?? '—'}</p></div> } }, { header: 'Action', render: (item) => <Badge tone={actionTone(item.action)}>{item.action}</Badge> }, { header: 'Entity / ID', render: (item) => <div><p>{item.module}</p><p className="max-w-44 truncate text-xs text-muted">{item.record_reference}</p></div> }, { header: 'Safe metadata', render: (item) => <span className="block max-w-xs whitespace-normal text-xs text-muted">{safeMetadata(item.after_data ?? item.before_data)}</span> }, { header: 'Timestamp', render: (item) => new Date(item.created_at).toLocaleString() }]} /></div></Card></div>
}
