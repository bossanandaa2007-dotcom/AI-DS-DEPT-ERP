export const PERMISSIONS = {
  manageUsers: 'manage_users',
  manageAcademicSetup: 'manage_academic_setup',
  viewDepartmentReports: 'view_department_reports',
  manageAttendance: 'manage_attendance',
  manageMarks: 'manage_marks',
  reviewStudentRequests: 'review_student_requests',
  approveFinalRequests: 'approve_final_requests',
  viewOwnRecords: 'view_own_records',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
