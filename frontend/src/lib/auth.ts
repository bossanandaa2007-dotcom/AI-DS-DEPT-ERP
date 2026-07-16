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
