import { AUTH_EMAIL_DOMAIN } from '@/constants/auth'
import { PERMISSIONS, type Permission } from '@/constants/permissions'
import { USER_ROLES } from '@/constants/roles'
import { ROUTE_PATHS } from '@/app/router/route-paths'
import type { UserRole } from '@/types'

const rolePermissions: Record<UserRole, Permission[]> = {
  [USER_ROLES.superAdmin]: Object.values(PERMISSIONS),
  [USER_ROLES.hod]: [PERMISSIONS.viewDepartmentReports, PERMISSIONS.manageAttendance, PERMISSIONS.manageMarks, PERMISSIONS.reviewStudentRequests],
  [USER_ROLES.faculty]: [PERMISSIONS.manageAttendance, PERMISSIONS.manageMarks, PERMISSIONS.reviewStudentRequests],
  [USER_ROLES.labAssistant]: [PERMISSIONS.manageAttendance, PERMISSIONS.reviewStudentRequests],
  [USER_ROLES.student]: [PERMISSIONS.viewOwnRecords],
}

export function hasRole(currentRole: UserRole, allowedRoles: readonly UserRole[]) {
  return allowedRoles.includes(currentRole)
}

/**
 * Roles that can hold a subject allocation and appear in a "which faculty" picker.
 * The HOD teaches as well as heads the department — Dr. M. Krishnamurthy holds 23AD301
 * for II-B — so a picker restricted to `faculty` alone would silently omit him.
 */
export function isTeachingStaff(role: UserRole) {
  return role === USER_ROLES.faculty || role === USER_ROLES.hod
}

/**
 * Sign-in accepts a User ID rather than an email: a student's roll number
 * (`9124243011`) or a staff ID (`krithikaa_aids`). Supabase Auth identifies accounts
 * by email, so a bare ID is expanded to `<lowercase-id>@<AUTH_EMAIL_DOMAIN>`.
 * A value that already contains `@` is passed through, so an account created with a
 * real email address (the bootstrap super admin) still signs in.
 */
export function resolveLoginEmail(identifier: string) {
  const value = identifier.trim().toLowerCase()
  if (!value) return ''
  return value.includes('@') ? value : `${value}@${AUTH_EMAIL_DOMAIN}`
}

export function hasPermission(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission)
}

export function getDefaultRouteForRole(role: UserRole) {
  const defaultRoutes: Record<UserRole, string> = {
    [USER_ROLES.superAdmin]: ROUTE_PATHS.superAdmin,
    [USER_ROLES.hod]: ROUTE_PATHS.hod,
    [USER_ROLES.faculty]: ROUTE_PATHS.faculty,
    [USER_ROLES.labAssistant]: ROUTE_PATHS.labAssistant,
    [USER_ROLES.student]: ROUTE_PATHS.student,
  }

  return defaultRoutes[role]
}
