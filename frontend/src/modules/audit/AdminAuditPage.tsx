import { useCallback, useMemo, useState } from 'react'
import { Download, Eye, RefreshCw } from 'lucide-react'

import { DataTable } from '@/components/common/DataTable'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { USER_ROLES } from '@/constants/roles'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { departmentOperationsRepository } from '@/services/supabase/departmentOperationsRepository'
import type { Json } from '@/types/database.types'

type AuditData = Awaited<ReturnType<typeof departmentOperationsRepository.loadAudit>>
type AuditRecord = AuditData['records'][number]
type AuditProfile = AuditData['profiles'][number]
type JsonRecord = Record<string, Json>

interface DisplayRecord extends AuditRecord {
  actionLabel: string
  actorIdentifier: string
  actorName: string
  moduleLabel: string
  recordName: string
  roleLabel: string
  statusLabel: string
}

const roleLabels: Record<string, string> = {
  faculty: 'Faculty',
  hod: 'HOD',
  lab_assistant: 'Lab Assistant',
  student: 'Student',
  super_admin: 'Admin',
}

const actionLabels: Record<string, string> = {
  create: 'Created',
  created: 'Created',
  delete: 'Deactivated',
  finalize: 'Finalized',
  finalized: 'Finalized',
  insert: 'Created',
  login: 'Signed in',
  logout: 'Signed out',
  reject: 'Rejected',
  rejected: 'Rejected',
  update: 'Updated',
  updated: 'Updated',
}

const sensitiveKeyFragments = ['auth', 'authorization', 'email', 'file_path', 'jwt', 'password', 'path', 'secret', 'storage', 'token']
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const tokenPattern = /\b(?:bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/i

const isRecord = (value: Json | null | undefined): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const titleCase = (value: string) => value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (letter) => letter.toUpperCase())
const roleLabel = (value: string | null | undefined) => value ? roleLabels[value] ?? titleCase(value) : 'System'
const readableAction = (value: string) => actionLabels[value.toLowerCase()] ?? titleCase(value)
const readableModule = (value: string) => titleCase(value.replace(/logs?$/i, ''))
const isSensitiveKey = (key: string) => sensitiveKeyFragments.some((fragment) => key.toLowerCase().includes(fragment))
const isReferenceKey = (key: string) => key.toLowerCase() === 'id' || key.toLowerCase().endsWith('_id')
const toneForStatus = (value: string): 'primary' | 'success' | 'warning' | 'muted' => /active|approve|complete|final|success|resolved/i.test(value) ? 'success' : /fail|reject|inactive|cancel|delete|deactivate|error/i.test(value) ? 'warning' : /pending|draft|review/i.test(value) ? 'primary' : 'muted'
const toneForAction = (value: string): 'primary' | 'success' | 'warning' | 'muted' => /approve|create|final|resolve|sign/i.test(value) ? 'success' : /delete|reject|deactivate|fail|lock/i.test(value) ? 'warning' : 'primary'

function safeScalar(key: string, value: Json | undefined): string {
  if (value === null || value === undefined) return '—'
  if (isReferenceKey(key)) return uuidPattern.test(String(value)) ? '[protected reference]' : String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return Array.isArray(value) ? `${value.length} item(s)` : '[protected structured data]'
  const clean = value.trim()
  if (!clean) return '—'
  if (uuidPattern.test(clean) || emailPattern.test(clean) || tokenPattern.test(clean) || /password|token|secret|storage\//i.test(clean)) return '[protected]'
  return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean
}

function field(value: Json | null, keys: string[]): string | null {
  if (!isRecord(value)) return null
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim() && !uuidPattern.test(candidate) && !emailPattern.test(candidate)) return candidate.trim()
    if (typeof candidate === 'number') return String(candidate)
  }
  return null
}

function recordName(record: AuditRecord): string {
  return field(record.after_data, ['record_name', 'display_name', 'full_name', 'name', 'title', 'label', 'subject_name', 'subject_code', 'code', 'request_type'])
    ?? field(record.before_data, ['record_name', 'display_name', 'full_name', 'name', 'title', 'label', 'subject_name', 'subject_code', 'code', 'request_type'])
    ?? `${readableModule(record.module)} record`
}

function statusLabel(record: AuditRecord): string {
  const status = field(record.after_data, ['status', 'new_status', 'state']) ?? field(record.before_data, ['status', 'old_status', 'state'])
  if (status) return titleCase(status)
  if (isRecord(record.after_data) && typeof record.after_data.is_active === 'boolean') return record.after_data.is_active ? 'Active' : 'Inactive'
  if (isRecord(record.before_data) && typeof record.before_data.is_active === 'boolean') return record.before_data.is_active ? 'Was active' : 'Was inactive'
  return 'Recorded'
}

function summarizeChanges(value: Json | null) {
  if (!isRecord(value)) return 'No safe field summary available'
  const entries = Object.entries(value)
    .filter(([key]) => !isSensitiveKey(key))
    .map(([key, item]) => `${titleCase(key)}: ${safeScalar(key, item)}`)
    .filter((item) => !item.includes('[protected structured data]'))
    .slice(0, 3)
  return entries.length ? entries.join(' · ') : 'No safe field summary available'
}

function flattenSafe(value: Json | null, prefix = ''): Map<string, string> {
  const output = new Map<string, string>()
  if (!isRecord(value)) return output
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue
    const label = prefix ? `${prefix} / ${titleCase(key)}` : titleCase(key)
    if (isRecord(item) && !isReferenceKey(key)) {
      flattenSafe(item, label).forEach((childValue, childKey) => output.set(childKey, childValue))
      continue
    }
    output.set(label, safeScalar(key, item))
  }
  return output
}

function changedFields(record: AuditRecord) {
  const before = flattenSafe(record.before_data)
  const after = flattenSafe(record.after_data)
  return [...new Set([...before.keys(), ...after.keys()])]
    .map((key) => ({ id: key, field: key, before: before.get(key) ?? '—', after: after.get(key) ?? '—' }))
    .filter((row) => row.before !== row.after)
}

function makeCsv(rows: DisplayRecord[]) {
  const headers = ['Date and time', 'Actor name', 'Role', 'Identifier', 'Action', 'Module', 'Record name', 'Status']
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  return [headers, ...rows.map((row) => [new Date(row.created_at).toLocaleString(), row.actorName, row.roleLabel, row.actorIdentifier, row.actionLabel, row.moduleLabel, row.recordName, row.statusLabel])]
    .map((row) => row.map(escape).join(','))
    .join('\n')
}

export function AdminAuditPage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => departmentOperationsRepository.loadAudit(), [])
  const resource = useAsyncResource(load)
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<DisplayRecord | null>(null)

  const profiles = useMemo(() => resource.data?.profiles ?? [], [resource.data?.profiles])
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const records: DisplayRecord[] = useMemo(() => (resource.data?.records ?? []).map((record) => {
    const actor: AuditProfile | undefined = record.actor_id ? profileById.get(record.actor_id) : undefined
    return {
      ...record,
      actionLabel: readableAction(record.action),
      actorIdentifier: actor?.employee_or_register_number ?? '—',
      actorName: actor?.full_name ?? 'System',
      moduleLabel: readableModule(record.module),
      recordName: recordName(record),
      roleLabel: roleLabel(record.actor_role ?? actor?.role),
      statusLabel: statusLabel(record),
    }
  }), [profileById, resource.data?.records])
  const modules = useMemo(() => [...new Set(records.map((record) => record.module))].sort((a, b) => readableModule(a).localeCompare(readableModule(b))), [records])
  const roles = useMemo(() => [...new Set(records.map((record) => record.actor_role).filter(Boolean) as string[])].sort((a, b) => roleLabel(a).localeCompare(roleLabel(b))), [records])
  const actions = useMemo(() => [...new Set(records.map((record) => record.action))].sort((a, b) => readableAction(a).localeCompare(readableAction(b))), [records])
  const users = useMemo(() => profiles.filter((profile) => records.some((record) => record.actor_id === profile.id)).sort((a, b) => a.full_name.localeCompare(b.full_name)), [profiles, records])
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return records.filter((record) => {
      const haystack = [record.actorName, record.actorIdentifier, record.roleLabel, record.actionLabel, record.moduleLabel, record.recordName, record.statusLabel, summarizeChanges(record.after_data ?? record.before_data)].join(' ').toLowerCase()
      return (!normalizedQuery || haystack.includes(normalizedQuery))
        && (!fromDate || record.created_at >= `${fromDate}T00:00:00`)
        && (!toDate || record.created_at <= `${toDate}T23:59:59.999Z`)
        && (moduleFilter === 'all' || record.module === moduleFilter)
        && (roleFilter === 'all' || record.actor_role === roleFilter)
        && (actionFilter === 'all' || record.action === actionFilter)
        && (userFilter === 'all' || record.actor_id === userFilter)
    })
  }, [actionFilter, fromDate, moduleFilter, query, records, roleFilter, toDate, userFilter])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const exportCsv = () => {
    const blob = new Blob([makeCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `safe-audit-export-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (currentUser && currentUser.role !== USER_ROLES.superAdmin) return <ErrorState title="Audit access denied" description="Only the Super Admin can open the Admin Audit page." />
  if (resource.isLoading) return <LoadingState label="Loading live audit activity…" />
  if (resource.error || !resource.data) return <div className="space-y-3"><ErrorState title="Audit activity unavailable" description={resource.error ?? 'No audit records were returned.'} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>

  return <div className="space-y-6">
    <PageHeader title="Admin audit" description="Read-only live Supabase audit trail with protected identifiers and sanitized change details." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button><Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}><Download className="size-4" /> Export CSV</Button></div>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><p className="text-sm text-muted">Visible audit records</p><p className="mt-1 text-2xl font-bold text-success">{records.length}</p></Card>
      <Card><p className="text-sm text-muted">Matching filters</p><p className="mt-1 text-2xl font-bold">{filtered.length}</p></Card>
      <Card><p className="text-sm text-muted">Modules recorded</p><p className="mt-1 text-2xl font-bold">{modules.length}</p></Card>
      <Card><p className="text-sm text-muted">Recorded actors</p><p className="mt-1 text-2xl font-bold">{users.length}</p></Card>
    </div>

    <Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-semibold xl:col-span-2">Search<Input className="mt-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, identifier, action, module, record or status" /></label>
        <label className="text-sm font-semibold">From date<Input className="mt-1" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="text-sm font-semibold">To date<Input className="mt-1" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        <label className="text-sm font-semibold">Module<Select className="mt-1" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}><option value="all">All modules</option>{modules.map((module) => <option key={module} value={module}>{readableModule(module)}</option>)}</Select></label>
        <label className="text-sm font-semibold">Role<Select className="mt-1" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</Select></label>
        <label className="text-sm font-semibold">Action<Select className="mt-1" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="all">All actions</option>{actions.map((item) => <option key={item} value={item}>{readableAction(item)}</option>)}</Select></label>
        <label className="text-sm font-semibold">User<Select className="mt-1" value={userFilter} onChange={(event) => setUserFilter(event.target.value)}><option value="all">All users</option>{users.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name} · {profile.employee_or_register_number ?? roleLabel(profile.role)}</option>)}</Select></label>
      </div>
    </Card>

    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-text">Audit records</h2>
          <p className="mt-1 text-sm text-muted">Sensitive fields are redacted before display and export.</p>
        </div>
        <label className="text-sm font-semibold">Rows per page<Select className="ml-2 w-24" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></Select></label>
      </div>
      <div className="mt-4">
        <DataTable rows={pageRows} empty={<EmptyState title="No audit records match the filters" description="Try widening the date range or clearing a filter." />} columns={[
          { header: 'Date / time', render: (record) => <span>{new Date(record.created_at).toLocaleString()}</span> },
          { header: 'Actor', render: (record) => <div><p className="font-semibold">{record.actorName}</p><p className="text-xs text-muted">{record.roleLabel} · {record.actorIdentifier}</p></div> },
          { header: 'Action', render: (record) => <Badge tone={toneForAction(record.actionLabel)}>{record.actionLabel}</Badge> },
          { header: 'Module', render: (record) => record.moduleLabel },
          { header: 'Record / status', render: (record) => <div><p className="font-semibold">{record.recordName}</p><Badge tone={toneForStatus(record.statusLabel)}>{record.statusLabel}</Badge></div> },
          { header: 'Safe summary', render: (record) => <span className="block max-w-xs whitespace-normal text-xs text-muted">{summarizeChanges(record.after_data ?? record.before_data)}</span> },
          { header: 'Details', render: (record) => <Button aria-label={`View safe audit details for ${record.recordName}`} className="min-h-8 px-3" variant="secondary" onClick={() => setSelected(record)}><Eye className="size-4" /> View</Button> },
        ]} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>Page {currentPage} of {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
          <Button variant="secondary" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
        </div>
      </div>
    </Card>

    <Modal isOpen={Boolean(selected)} title="Safe audit details" onClose={() => setSelected(null)}>
      {selected && <div className="space-y-4">
        <div className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
          <p><span className="font-semibold">Date:</span> {new Date(selected.created_at).toLocaleString()}</p>
          <p><span className="font-semibold">Actor:</span> {selected.actorName}</p>
          <p><span className="font-semibold">Role:</span> {selected.roleLabel}</p>
          <p><span className="font-semibold">Identifier:</span> {selected.actorIdentifier}</p>
          <p><span className="font-semibold">Action:</span> {selected.actionLabel}</p>
          <p><span className="font-semibold">Module:</span> {selected.moduleLabel}</p>
          <p><span className="font-semibold">Record:</span> {selected.recordName}</p>
          <p><span className="font-semibold">Status:</span> {selected.statusLabel}</p>
        </div>
        <DataTable rows={changedFields(selected)} empty={<EmptyState title="No safe before/after changes to show" description="The recorded change contains only protected values or non-field metadata." />} columns={[
          { header: 'Field', render: (row) => row.field },
          { header: 'Before', render: (row) => <span className="block max-w-56 whitespace-normal">{row.before}</span> },
          { header: 'After', render: (row) => <span className="block max-w-56 whitespace-normal">{row.after}</span> },
        ]} />
      </div>}
    </Modal>
  </div>
}
