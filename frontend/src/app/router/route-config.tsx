import { ArrowLeft, CircleAlert, ShieldAlert } from 'lucide-react'
import { Link, type RouteObject } from 'react-router-dom'

import { ROUTE_PATHS } from '@/app/router/route-paths'
import { USER_ROLES } from '@/constants/roles'
import { AppShell } from '@/layouts/AppShell'
import { RoleDashboardPage } from '@/modules/dashboard/RoleDashboardPage'
import { LoginPage } from '@/modules/auth/LoginPage'
import { HomeRedirect, JuryEligibleRoute, ProtectedRoleRoute } from '@/modules/auth/RouteGuards'
import { AcademicSetupPage } from '@/modules/academics/AcademicSetupPage'
import { SubjectAllocationPage } from '@/modules/academics/SubjectAllocationPage'
import { TimetablePage } from '@/modules/timetable/TimetablePage'
import { UserManagementPage } from '@/modules/users/UserManagementPage'
import { AttendancePage } from '@/modules/attendance/AttendancePage'
import { MarksPage } from '@/modules/marks/MarksPage'
import { RequestsPage } from '@/modules/requests/RequestsPage'
import { CommunicationPage } from '@/modules/communication/CommunicationPage'
import { PortionCompletionPage } from '@/modules/portion-completion/PortionCompletionPage'
import { ReportsPage } from '@/modules/reports/ReportsPage'
import { AuditPage } from '@/modules/audit/AuditPage'
import { DocumentReviewQueuePage, ReviewerAssignmentPage, StudentDocumentStatusPage } from '@/modules/document-reviews/DocumentReviewsPage'

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
