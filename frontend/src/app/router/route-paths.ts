export const ROUTE_PATHS = {
  home: '/',
  login: '/login',
  unauthorized: '/unauthorized',
  notFound: '/not-found',
  superAdmin: '/super-admin',
  superAdminUsers: '/super-admin/users',
  superAdminUserCategory: '/super-admin/users/:category',
  hod: '/hod',
  faculty: '/faculty',
  labAssistant: '/lab-assistant',
  student: '/student',
  studentRequests: '/student/requests',
  facultyDocumentReviews: '/faculty/document-reviews',
  facultyJuryReviews: '/faculty/jury-reviews',
  hodDocumentAssignments: '/hod/document-review-assignments',
  superAdminDocumentAssignments: '/super-admin/document-review-assignments',
  studentDocumentStatus: '/student/document-status',
  superAdminFacultyWorkload: '/super-admin/faculty-workload',
  hodFacultyWorkload: '/hod/faculty-workload',
} as const

export type RoutePath = (typeof ROUTE_PATHS)[keyof typeof ROUTE_PATHS]
