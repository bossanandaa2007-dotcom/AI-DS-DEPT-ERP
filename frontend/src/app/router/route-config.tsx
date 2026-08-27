import { ArrowLeft, CircleAlert, ShieldAlert } from 'lucide-react'
import { lazy } from 'react'
import { Link, type RouteObject } from 'react-router-dom'

import { ROUTE_PATHS } from '@/app/router/route-paths'
import { USER_ROLES } from '@/constants/roles'
import { AppShell } from '@/layouts/AppShell'
import { LoginPage } from '@/modules/auth/LoginPage'
import { HomeRedirect, JuryEligibleRoute, ProtectedRoleRoute } from '@/modules/auth/RouteGuards'

const RoleDashboardPage = lazy(() => import('@/modules/dashboard/RoleDashboardPage').then((m) => ({ default: m.RoleDashboardPage })))
const AcademicSetupPage = lazy(() => import('@/modules/academics/AcademicSetupPage').then((m) => ({ default: m.AcademicSetupPage })))
const SubjectAllocationPage = lazy(() => import('@/modules/academics/SubjectAllocationPage').then((m) => ({ default: m.SubjectAllocationPage })))
const TimetablePage = lazy(() => import('@/modules/timetable/TimetablePage').then((m) => ({ default: m.TimetablePage })))
const UserManagementPage = lazy(() => import('@/modules/users/UserManagementPage').then((m) => ({ default: m.UserManagementPage })))
const AttendancePage = lazy(() => import('@/modules/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })))
const MarksPage = lazy(() => import('@/modules/marks/MarksPage').then((m) => ({ default: m.MarksPage })))
const RequestsPage = lazy(() => import('@/modules/requests/RequestsPage').then((m) => ({ default: m.RequestsPage })))
const CommunicationPage = lazy(() => import('@/modules/communication/CommunicationPage').then((m) => ({ default: m.CommunicationPage })))
const PortionCompletionPage = lazy(() => import('@/modules/portion-completion/PortionCompletionPage').then((m) => ({ default: m.PortionCompletionPage })))
const ReportsPage = lazy(() => import('@/modules/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const AuditPage = lazy(() => import('@/modules/audit/AuditPage').then((m) => ({ default: m.AuditPage })))
const DocumentReviewQueuePage = lazy(() => import('@/modules/document-reviews/DocumentReviewsPage').then((m) => ({ default: m.DocumentReviewQueuePage })))
const ReviewerAssignmentPage = lazy(() => import('@/modules/document-reviews/DocumentReviewsPage').then((m) => ({ default: m.ReviewerAssignmentPage })))
const StudentDocumentStatusPage = lazy(() => import('@/modules/document-reviews/DocumentReviewsPage').then((m) => ({ default: m.StudentDocumentStatusPage })))

function MessagePage({ title, message, icon: Icon }: { title: string; message: string; icon: typeof ShieldAlert }) {
  return <main className="page-shell"><div className="app-container py-10"><section className="message-card"><Icon aria-hidden="true" className="size-8 text-warning" /><h1>{title}</h1><p>{message}</p><Link className="text-link" to={ROUTE_PATHS.home}><ArrowLeft className="size-4" /> Return to sign in</Link></section></div></main>
}

const roleRoute = (path: string, role: import('@/types').UserRole, moduleRoutes: RouteObject[] = []): RouteObject => ({ path, element: <ProtectedRoleRoute allowedRoles={[role]} />, children: [{ element: <AppShell />, children: [{ index: true, element: <RoleDashboardPage /> }, ...moduleRoutes, { path: '*', element: <MessagePage title="Page not found" message="The requested module is not available for this role." icon={CircleAlert} /> }] }] })

export const routeConfig: RouteObject[] = [
  { path: ROUTE_PATHS.home, element: <HomeRedirect /> },
  { path: ROUTE_PATHS.login, element: <LoginPage /> },
  { path: ROUTE_PATHS.unauthorized, element: <MessagePage title="Access unavailable" message="Your current role does not have access to that area." icon={ShieldAlert} /> },
  { path: ROUTE_PATHS.notFound, element: <MessagePage title="Page not found" message="The requested page does not exist." icon={CircleAlert} /> },
  roleRoute(ROUTE_PATHS.superAdmin, USER_ROLES.superAdmin, [{ path: 'users', element: <UserManagementPage /> }, { path: 'academic-setup', element: <AcademicSetupPage /> }, { path: 'subject-allocation', element: <SubjectAllocationPage /> }, { path: 'timetable', element: <TimetablePage /> }, { path: 'attendance', element: <AttendancePage /> }, { path: 'marks', element: <MarksPage /> }, { path: 'requests', element: <RequestsPage /> }, { path: 'announcements', element: <CommunicationPage /> }, { path: 'audit', element: <AuditPage /> }, { path: 'reports', element: <ReportsPage /> }, { path: 'document-review-assignments', element: <ReviewerAssignmentPage /> }]),
  roleRoute(ROUTE_PATHS.hod, USER_ROLES.hod, [{ path: 'faculty-profiles', element: <UserManagementPage /> }, { path: 'academic-setup', element: <AcademicSetupPage /> }, { path: 'subject-allocation', element: <SubjectAllocationPage /> }, { path: 'timetable', element: <TimetablePage /> }, { path: 'attendance', element: <AttendancePage /> }, { path: 'marks', element: <MarksPage /> }, { path: 'requests', element: <RequestsPage /> }, { path: 'portion-progress', element: <PortionCompletionPage /> }, { path: 'announcements', element: <CommunicationPage /> }, { path: 'audit', element: <AuditPage /> }, { path: 'reports', element: <ReportsPage /> }, { path: 'document-review-assignments', element: <ReviewerAssignmentPage /> }]),
  roleRoute(ROUTE_PATHS.faculty, USER_ROLES.faculty, [{ path: 'timetable', element: <TimetablePage /> }, { path: 'attendance', element: <AttendancePage /> }, { path: 'marks', element: <MarksPage /> }, { path: 'requests', element: <RequestsPage /> }, { path: 'portion-completion', element: <PortionCompletionPage /> }, { path: 'announcements', element: <CommunicationPage /> }, { path: 'document-reviews', element: <DocumentReviewQueuePage stage="faculty" /> }, { path: 'jury-reviews', element: <JuryEligibleRoute />, children: [{ index: true, element: <DocumentReviewQueuePage stage="jury" /> }] }]),
  roleRoute(ROUTE_PATHS.labAssistant, USER_ROLES.labAssistant, [{ path: 'lab-timetable', element: <TimetablePage /> }, { path: 'attendance', element: <AttendancePage /> }, { path: 'leave', element: <RequestsPage /> }, { path: 'announcements', element: <CommunicationPage /> }]),
  roleRoute(ROUTE_PATHS.student, USER_ROLES.student, [{ path: 'timetable', element: <TimetablePage /> }, { path: 'attendance', element: <AttendancePage /> }, { path: 'marks', element: <MarksPage /> }, { path: 'requests', element: <RequestsPage /> }, { path: 'announcements', element: <CommunicationPage sections={['announcements']} /> }, { path: 'complaints', element: <CommunicationPage sections={['complaints']} /> }, { path: 'document-status', element: <StudentDocumentStatusPage /> }]),
  { path: '*', element: <MessagePage title="Page not found" message="The requested page does not exist." icon={CircleAlert} /> },
]
