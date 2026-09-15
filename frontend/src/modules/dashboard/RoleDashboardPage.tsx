import { useCallback, useEffect, useState } from 'react'

import { PageHeader } from '@/components/common/PageHeader'
import { DashboardActivityFeed } from '@/components/dashboard/DashboardActivityFeed'
import { DashboardMetricGrid } from '@/components/dashboard/DashboardMetricGrid'
import { DashboardQuickActions } from '@/components/dashboard/DashboardQuickActions'
import { DashboardSectionCard } from '@/components/dashboard/DashboardSectionCard'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Button } from '@/components/ui/Button'
import { ROUTE_PATHS } from '@/app/router/route-paths'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { reportingRepository } from '@/services/supabase/reportingRepository'

const studentQuickActions = [
  { label: 'Timetable', description: 'View today and weekly classes', path: `${ROUTE_PATHS.student}/timetable` },
  { label: 'Attendance', description: 'Check attendance records', path: `${ROUTE_PATHS.student}/attendance` },
  { label: 'Requests', description: 'Track leave and OD requests', path: `${ROUTE_PATHS.student}/requests` },
  { label: 'Complaints', description: 'Raise and track complaints', path: `${ROUTE_PATHS.student}/complaints` },
]

function MobileStudentPerformance({ data, userId }: { data: Awaited<ReturnType<typeof reportingRepository.load>>; userId: string }) {
  const attendance = data.attendance.filter((record) => record.student_id === userId)
  const attended = attendance.filter((record) => record.status === 'present' || record.status === 'late').length
  const attendancePercent = attendance.length ? Math.round((attended / attendance.length) * 100) : 0
  const scored = data.marks.filter((mark) => mark.student_id === userId && !mark.absent && mark.obtained_marks !== null)
  const markPercents = scored.map((mark) => {
    const assessment = data.assessments.find((row) => row.id === mark.assessment_id)
    return assessment ? (Number(mark.obtained_marks) / Number(assessment.maximum_marks)) * 100 : null
  }).filter((value): value is number => value !== null && Number.isFinite(value))
  const marksPercent = markPercents.length ? Math.round(markPercents.reduce((sum, value) => sum + value, 0) / markPercents.length) : 0
  const items = [
    { label: 'Attendance', value: attendancePercent, detail: `${attendance.length} record${attendance.length === 1 ? '' : 's'}` },
    { label: 'Marks', value: marksPercent, detail: `${scored.length} mark${scored.length === 1 ? '' : 's'}` },
  ]
  return <section className="grid grid-cols-2 gap-3 md:hidden">
    {items.map((item) => <div key={item.label} className="rounded border border-border bg-surface p-3 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{item.label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{item.value}%</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary" style={{ width: `${item.value}%` }} /></div>
      <p className="mt-2 text-xs text-muted">{item.detail}</p>
    </div>)}
  </section>
}

function LiveDateTime() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  return <div className="rounded border border-border bg-surface px-3 py-2 text-sm font-semibold text-text shadow-sm">
    <span>{now.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
    <span className="mx-2 text-muted">|</span>
    <span>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
  </div>
}

export function RoleDashboardPage() {
  const { currentUser } = useAuth()
  const load = useCallback(() => reportingRepository.load(), [])
  const resource = useAsyncResource(load, 'reportingData')
  if (resource.isLoading) return <LoadingState label="Loading your live dashboard…" />
  if (resource.error || !resource.data) return <div className="space-y-3"><ErrorState title="Dashboard unavailable" description={resource.error ?? 'No reporting data was returned.'} /><Button variant="secondary" onClick={() => void resource.reload()}>Retry</Button></div>
  const dashboard = reportingRepository.dashboard(resource.data)
  const studentName = typeof currentUser?.name === 'string' ? currentUser.name.trim() : ''
  const isStudent = currentUser?.role === 'student'
  const title = currentUser?.role === 'student' ? `Hi, ${studentName || 'Student'} 👋` : dashboard.title
  const activitySections = dashboard.sections.filter((section) => /activity|operation|announcement|audit/i.test(section.title))
  const activityItems = activitySections.flatMap((section) => section.items)
  const primarySections = dashboard.sections.filter((section) => !activitySections.includes(section))
  return <div className="space-y-6">
    <PageHeader title={title} description={currentUser?.role === 'student' ? undefined : dashboard.description} actions={<LiveDateTime />} />
    {isStudent && currentUser && <MobileStudentPerformance data={resource.data} userId={currentUser.id} />}
    {isStudent && <div className="md:hidden"><DashboardQuickActions actions={studentQuickActions} /></div>}
    {!isStudent && dashboard.quickActions && dashboard.quickActions.length > 0 && <DashboardQuickActions actions={dashboard.quickActions} />}
    {!isStudent && <DashboardMetricGrid metrics={dashboard.metrics} />}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-5 xl:grid-cols-2">{primarySections.map((section) => <div key={section.title} className={isStudent && /subject-wise attendance|marks summary/i.test(section.title) ? 'hidden md:block' : undefined}><DashboardSectionCard section={section} /></div>)}</div>
      <DashboardActivityFeed items={activityItems} />
    </div>
  </div>
}
