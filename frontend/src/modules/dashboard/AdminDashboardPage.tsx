import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw } from 'lucide-react'

import { ROUTE_PATHS } from '@/app/router/route-paths'
import { DataTable } from '@/components/common/DataTable'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { USER_ROLES } from '@/constants/roles'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { reportingRepository, type ReportingData } from '@/services/supabase/reportingRepository'
import type { Json } from '@/types/database.types'

type Metric = { label: string; value: string; detail: string; tone: 'primary' | 'success' | 'warning' | 'muted' }
type AuditRow = { id: string; actor: string; action: string; module: string; detail: string; createdAt: string }
type IssueRow = { id: string; area: string; item: string; status: string; detail: string }

const finalizedStatuses = new Set(['finalized', 'locked'])
const pendingRequestStatuses = new Set(['draft', 'submitted', 'class_teacher_approved', 'faculty_approved', 'provisional_approved', 'certificate_pending', 'certificate_verified'])
const sensitiveKeys = ['auth', 'authorization', 'email', 'password', 'path', 'secret', 'storage', 'token']
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

const quickActions = [
  { label: 'Add Student', description: 'Open Super Admin user provisioning', path: `${ROUTE_PATHS.superAdmin}/users` },
  { label: 'Add Faculty', description: 'Open Faculty provisioning', path: `${ROUTE_PATHS.superAdmin}/users` },
  { label: 'Academic Setup', description: 'Manage academic years, semesters, sections and subjects', path: `${ROUTE_PATHS.superAdmin}/academic-setup` },
  { label: 'Subject Allocation', description: 'Assign active subjects to eligible faculty', path: `${ROUTE_PATHS.superAdmin}/subject-allocation` },
  { label: 'Timetable', description: 'Monitor and manage Admin timetable entries', path: `${ROUTE_PATHS.superAdmin}/timetable` },
  { label: 'Attendance', description: 'Monitor attendance analytics', path: `${ROUTE_PATHS.superAdmin}/attendance` },
  { label: 'Reports', description: 'Open Admin reports', path: `${ROUTE_PATHS.superAdmin}/reports` },
  { label: 'Audit', description: 'Review sanitized audit activity', path: `${ROUTE_PATHS.superAdmin}/audit` },
]

const display = (value: string) => value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const safe = (value: string | null | undefined) => {
  const text = String(value ?? '—').trim()
  if (!text || uuidPattern.test(text) || emailPattern.test(text) || /password|token|secret|storage\//i.test(text)) return '—'
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}
const percent = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : null
const displayPercent = (part: number, whole: number) => {
  const value = percent(part, whole)
  return value === null ? '—' : `${value}%`
}
const today = () => new Date().toISOString().slice(0, 10)
const tone = (value: string): 'primary' | 'success' | 'warning' | 'muted' => /active|complete|final|ok|resolved|verified/i.test(value) ? 'success' : /issue|pending|unallocated|warning/i.test(value) ? 'warning' : 'primary'
const safeMetadata = (value: Json | null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Recorded action'
  return Object.entries(value).filter(([key]) => !sensitiveKeys.some((blocked) => key.toLowerCase().includes(blocked))).slice(0, 2).map(([key, item]) => `${display(key)}: ${typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ? safe(String(item)) : '[protected]'}`).join(' · ') || 'Recorded action'
}

function dashboardMetrics(data: ReportingData): Metric[] {
  const students = data.profiles.filter((profile) => profile.role === 'student')
  const faculty = data.profiles.filter((profile) => profile.role === 'faculty')
  const activeUsers = data.profiles.filter((profile) => profile.status === 'active')
  const inactiveUsers = data.profiles.filter((profile) => profile.status !== 'active')
  const todaySessions = data.sessions.filter((session) => finalizedStatuses.has(session.status) && session.attendance_date === today())
  const todayRecords = data.attendance.filter((record) => todaySessions.some((session) => session.id === record.session_id))
  const todayPresent = todayRecords.filter((record) => record.status === 'present' || record.status === 'late').length
  const pendingApprovals = data.requests.filter((request) => pendingRequestStatuses.has(request.status)).length
  const pendingCorrections = data.attendanceCorrections.filter((item) => item.status === 'pending').length + data.markCorrections.filter((item) => item.status === 'pending').length
  const unallocated = data.subjects.filter((subject) => subject.is_active && !data.assignments.some((assignment) => assignment.subject_id === subject.id && assignment.assignment_type === 'subject_faculty' && assignment.is_active)).length
  const workloadWarnings = faculty.filter((profile) => data.assignments.filter((assignment) => assignment.faculty_id === profile.id && assignment.is_active).reduce((sum, assignment) => sum + Number(assignment.weekly_hours), 0) > 20).length
  const timetableIssues = activeTimetableIssues(data).length
  return [
    { label: 'Total Students', value: String(students.length), detail: `${students.filter((profile) => profile.status === 'active').length} active`, tone: 'primary' },
    { label: 'Total Faculty', value: String(faculty.length), detail: `${faculty.filter((profile) => profile.status === 'active').length} active`, tone: 'primary' },
    { label: 'Active / inactive users', value: `${activeUsers.length}/${inactiveUsers.length}`, detail: 'All visible live profiles', tone: inactiveUsers.length ? 'warning' : 'success' },
    { label: 'Sections', value: String(data.sections.length), detail: `${data.sections.filter((section) => section.is_active).length} active sections`, tone: 'primary' },
    { label: 'Subjects', value: String(data.subjects.length), detail: `${data.subjects.filter((subject) => subject.is_active).length} active subjects`, tone: 'primary' },
    { label: 'Today Attendance %', value: displayPercent(todayPresent, todayRecords.length), detail: `${todaySessions.length} finalized session(s) today`, tone: todayRecords.length ? 'success' : 'warning' },
    { label: 'Pending approvals', value: String(pendingApprovals), detail: 'Leave, Gate Pass and OD', tone: pendingApprovals ? 'warning' : 'success' },
    { label: 'Pending corrections', value: String(pendingCorrections), detail: 'Attendance and marks correction workflow', tone: pendingCorrections ? 'warning' : 'success' },
    { label: 'Unallocated Subjects', value: String(unallocated), detail: 'Active subjects without subject faculty', tone: unallocated ? 'warning' : 'success' },
    { label: 'Faculty workload warnings', value: String(workloadWarnings), detail: 'Faculty over 20 assigned weekly hours', tone: workloadWarnings ? 'warning' : 'success' },
    { label: 'Timetable issues', value: String(timetableIssues), detail: 'Detected duplicate section/faculty/room/lab slots', tone: timetableIssues ? 'warning' : 'success' },
  ]
}

function activeTimetableIssues(data: ReportingData): IssueRow[] {
  const rows: IssueRow[] = []
  const activeEntries = data.timetable.filter((entry) => entry.is_active)
  const addDuplicates = (label: string, keyFor: (id: typeof activeEntries[number]) => string | null) => {
    const groups = new Map<string, number>()
    activeEntries.forEach((entry) => {
      const key = keyFor(entry)
      if (key) groups.set(key, (groups.get(key) ?? 0) + 1)
    })
    groups.forEach((count, key) => {
      if (count > 1) rows.push({ id: `${label}-${key}`, area: 'Timetable', item: label, status: 'warning', detail: `${count} active entries share ${key}` })
    })
  }
  addDuplicates('Section conflict', (entry) => `${entry.section_id}-${entry.day_of_week}-${entry.period}`)
  addDuplicates('Faculty conflict', (entry) => entry.faculty_id ? `${entry.faculty_id}-${entry.day_of_week}-${entry.period}` : null)
  addDuplicates('Room conflict', (entry) => entry.room ? `${entry.room}-${entry.day_of_week}-${entry.period}` : null)
  addDuplicates('Lab conflict', (entry) => entry.lab ? `${entry.lab}-${entry.day_of_week}-${entry.period}` : null)
  addDuplicates('Lab Assistant conflict', (entry) => entry.lab_assistant_id ? `${entry.lab_assistant_id}-${entry.day_of_week}-${entry.period}` : null)
  return rows
}

function operationalIssues(data: ReportingData): IssueRow[] {
  const subjectIssues = data.subjects.filter((subject) => subject.is_active && !data.assignments.some((assignment) => assignment.subject_id === subject.id && assignment.assignment_type === 'subject_faculty' && assignment.is_active)).map((subject) => ({ id: `subject-${subject.id}`, area: 'Subject Allocation', item: `${subject.code} · ${subject.name}`, status: 'unallocated', detail: 'No active subject faculty allocation' }))
  const workload = data.profiles.filter((profile) => profile.role === 'faculty' && profile.status === 'active').map((profile) => {
    const hours = data.assignments.filter((assignment) => assignment.faculty_id === profile.id && assignment.is_active).reduce((sum, assignment) => sum + Number(assignment.weekly_hours), 0)
    return { profile, hours }
  }).filter((item) => item.hours > 20).map((item) => ({ id: `workload-${item.profile.id}`, area: 'Faculty workload', item: `${item.profile.full_name} · ${item.profile.employee_or_register_number ?? '—'}`, status: 'warning', detail: `${item.hours} assigned weekly hours` }))
  return [...subjectIssues, ...workload, ...activeTimetableIssues(data)].slice(0, 12)
}

function auditRows(data: ReportingData): AuditRow[] {
  return data.auditLogs.slice(0, 8).map((log) => {
    const actor = log.actor_id ? data.profiles.find((profile) => profile.id === log.actor_id) : null
    return { id: log.id, actor: actor?.full_name ?? 'System', action: display(log.action), module: display(log.module), detail: safeMetadata(log.after_data ?? log.before_data), createdAt: new Date(log.created_at).toLocaleString() }
  })
}

function safeCompute<T>(fallback: T, fn: () => T) {
  try { return { value: fn(), error: null as string | null } } catch (error) { return { value: fallback, error: error instanceof Error ? error.message : 'A dashboard section could not be calculated.' } }
}

export function AdminDashboardPage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => reportingRepository.load(), [])
  const resource = useAsyncResource(load)
  const metrics = useMemo(() => safeCompute<Metric[]>([], () => resource.data ? dashboardMetrics(resource.data) : []), [resource.data])
  const issues = useMemo(() => safeCompute<IssueRow[]>([], () => resource.data ? operationalIssues(resource.data) : []), [resource.data])
  const audits = useMemo(() => safeCompute<AuditRow[]>([], () => resource.data ? auditRows(resource.data) : []), [resource.data])
  const partialErrors = [metrics.error, issues.error, audits.error].filter(Boolean)

  if (currentUser && currentUser.role !== USER_ROLES.superAdmin) return <ErrorState title="Dashboard access denied" description="Only the Super Admin can open the Admin dashboard." />
  if (resource.isLoading) return <LoadingState label="Loading live Admin dashboard…" />
  if (resource.error || !resource.data) return <div className="space-y-3"><ErrorState title="Dashboard unavailable" description={resource.error ?? 'No dashboard data was returned.'} /><Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button></div>

  return <div className="space-y-6">
    <PageHeader title="Admin dashboard" description="Live Supabase overview for users, academics, attendance, requests, corrections, workload, timetable health and audit activity." actions={<Button variant="secondary" onClick={() => void resource.reload()}><RefreshCw className="size-4" /> Retry</Button>} />
    {partialErrors.length > 0 && <ErrorState title="Some dashboard sections could not be calculated" description={`${partialErrors.join(' ')} Other cards remain available.`} />}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.value.map((metric) => <Card key={metric.label}><p className="text-sm font-semibold text-muted">{metric.label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-text">{metric.value}</p><Badge tone={metric.tone}>{metric.detail}</Badge></Card>)}
      {!metrics.value.length && <Card className="sm:col-span-2 xl:col-span-4"><EmptyState title="No dashboard metrics available" description="Retry or verify that live Supabase tables are reachable." /></Card>}
    </div>

    <Card>
      <h2 className="font-bold text-text">Quick actions</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => <Link key={action.label} to={action.path} className="group rounded-lg border border-border p-4 transition-colors hover:border-secondary hover:bg-background"><p className="flex items-center justify-between gap-2 font-semibold text-text">{action.label}<ArrowRight className="size-4 text-secondary transition-transform group-hover:translate-x-0.5" /></p><p className="mt-1 text-sm text-muted">{action.description}</p></Link>)}
      </div>
    </Card>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <h2 className="font-bold text-text">Operational warnings</h2>
        <p className="mt-1 text-sm text-muted">Unallocated subjects, workload warnings and timetable conflicts.</p>
        <div className="mt-4"><DataTable rows={issues.value} empty={<EmptyState title="No current warnings" description="Live records do not show allocation, workload or timetable issues." />} columns={[
          { header: 'Area', render: (row) => row.area },
          { header: 'Item', render: (row) => <span className="block max-w-xs whitespace-normal">{safe(row.item)}</span> },
          { header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{display(row.status)}</Badge> },
          { header: 'Detail', render: (row) => <span className="block max-w-xs whitespace-normal text-xs text-muted">{safe(row.detail)}</span> },
        ]} /></div>
      </Card>

      <Card>
        <h2 className="font-bold text-text">Recent Audit activity</h2>
        <p className="mt-1 text-sm text-muted">Sanitized latest live audit records.</p>
        <div className="mt-4"><DataTable rows={audits.value} empty={<EmptyState title="No recent audit activity" description="Audit records will appear here when Supabase returns them." />} columns={[
          { header: 'Actor', render: (row) => safe(row.actor) },
          { header: 'Action', render: (row) => <Badge tone="primary">{row.action}</Badge> },
          { header: 'Module', render: (row) => row.module },
          { header: 'Detail', render: (row) => <span className="block max-w-xs whitespace-normal text-xs text-muted">{row.detail}</span> },
          { header: 'Time', render: (row) => row.createdAt },
        ]} /></div>
      </Card>
    </div>
  </div>
}
