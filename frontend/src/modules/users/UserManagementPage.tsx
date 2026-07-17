import { Pencil, RefreshCw, Search } from 'lucide-react'
import { useCallback, useState } from 'react'

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
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { FacultyJuryEligibilityPanel } from '@/modules/users/FacultyJuryEligibilityPanel'
import { academicRepository } from '@/services/supabase/academicRepository'
import type { Database } from '@/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
const roles: Database['public']['Enums']['app_role'][] = ['student', 'faculty', 'lab_assistant', 'hod', 'super_admin']
const statuses: Database['public']['Enums']['user_status'][] = ['active', 'inactive', 'suspended']

function UserManagementContent() {
  const load = useCallback(() => academicRepository.loadProfileManagementData(), []); const resource = useAsyncResource(load); const [query, setQuery] = useState(''); const [role, setRole] = useState('all'); const [editing, setEditing] = useState<Profile | null>(null); const [name, setName] = useState(''); const [status, setStatus] = useState<Database['public']['Enums']['user_status']>('active'); const [departmentId, setDepartmentId] = useState(''); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('')
  if (resource.isLoading) return <LoadingState label="Loading existing Auth profiles…" />
  if (resource.error) return <ErrorState title="Unable to load profiles" description={resource.error} />
  const data = resource.data; if (!data) return null
  const users = data.profiles.filter((user) => (role === 'all' || user.role === role) && `${user.full_name} ${user.email} ${user.employee_or_register_number ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  const open = (user: Profile) => { setEditing(user); setName(user.full_name); setStatus(user.status); setDepartmentId(user.department_id ?? ''); setMessage('') }
  const save = async () => { if (!editing || name.trim().length < 2) { setMessage('Enter a valid profile name.'); return } setSaving(true); setMessage(''); try { await academicRepository.updateProfile(editing.id, { full_name: name.trim(), status, department_id: departmentId || null }); await resource.reload(); setEditing(null) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update profile.') } finally { setSaving(false) } }
  const department = (id: string | null) => data.departments.find((item) => item.id === id)?.name ?? '—'
  return <div className="space-y-6"><PageHeader title="User management" description="Manage existing authenticated profiles; creating Auth accounts remains a controlled bootstrap task." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Refresh</Button>} /><Card><div className="grid gap-3 md:grid-cols-[1fr_12rem]"><label className="relative"><span className="sr-only">Search profiles</span><Search className="absolute left-3 top-3 size-4 text-muted" /><Input className="pl-9" placeholder="Search profiles" value={query} onChange={(event) => setQuery(event.target.value)} /></label><Select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option>{roles.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</Select></div><div className="mt-5"><DataTable rows={users} empty={<EmptyState title="No matching profiles" />} columns={[{ header: 'Profile', render: (user) => <div><p className="font-semibold">{user.full_name}</p><p className="text-xs text-muted">{user.email}</p></div> }, { header: 'Role / ID', render: (user) => <div><p>{user.role.replaceAll('_', ' ')}</p><p className="text-xs text-muted">{user.employee_or_register_number ?? '—'}</p></div> }, { header: 'Department', render: (user) => department(user.department_id) }, { header: 'Status', render: (user) => <Badge tone={user.status === 'active' ? 'success' : user.status === 'suspended' ? 'warning' : 'muted'}>{user.status}</Badge> }, { header: 'Actions', render: (user) => <Button aria-label={`Edit ${user.full_name}`} className="min-h-8 px-2" variant="ghost" onClick={() => open(user)}><Pencil className="size-4" /></Button> }]} /></div></Card><Modal isOpen={Boolean(editing)} title="Edit existing profile" onClose={() => setEditing(null)}>{editing && <div className="space-y-4"><label className="block text-sm font-semibold">Name<Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="block text-sm font-semibold">Department<Select className="mt-1" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">No department</option>{data.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label><label className="block text-sm font-semibold">Status<Select className="mt-1" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>{message && <p className="text-sm text-error">{message}</p>}<div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save profile'}</Button></div></div>}</Modal></div>
}

export function UserManagementPage() {
  return <div className="space-y-6"><UserManagementContent /><FacultyJuryEligibilityPanel /></div>
}
