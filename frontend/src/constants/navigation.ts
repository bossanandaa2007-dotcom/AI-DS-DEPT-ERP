import { Activity, Bell, BookOpen, ClipboardCheck, FileText, GraduationCap, LayoutDashboard, ListChecks, MessageSquareWarning, School, ShieldCheck, Table2, UserRoundCheck, Users } from 'lucide-react'

import { ROUTE_PATHS } from '@/app/router/route-paths'
import { USER_ROLES } from '@/constants/roles'
import type { NavigationItem, UserRole } from '@/types'

const items = (basePath: string, definitions: Array<[string, string, NavigationItem['icon']]>): NavigationItem[] => definitions.map(([label, segment, icon]) => ({ label, path: segment ? `${basePath}/${segment}` : basePath, icon }))

export const ROLE_NAVIGATION: Record<UserRole, NavigationItem[]> = {
  [USER_ROLES.superAdmin]: items(ROUTE_PATHS.superAdmin, [['Dashboard', 'dashboard', LayoutDashboard], ['Users', 'users', Users], ['Academic Setup', 'academic-setup', School], ['Subject Allocation', 'subject-allocation', UserRoundCheck], ['Faculty Workload', 'faculty-workload', Activity], ['Timetable', 'timetable', Table2], ['Attendance', 'attendance', ClipboardCheck], ['Marks', 'marks', GraduationCap], ['Requests and OD', 'requests', FileText], ['Department Operations', 'announcements', Bell], ['Document Assignments', 'document-review-assignments', FileText], ['Audit', 'audit', ShieldCheck], ['Reports', 'reports', ListChecks]]),
  [USER_ROLES.hod]: items(ROUTE_PATHS.hod, [['Dashboard', '', LayoutDashboard], ['My Profile', 'faculty-profiles', Users], ['Academic Setup', 'academic-setup', School], ['Faculty Workload', 'faculty-workload', Activity], ['Timetable', 'timetable', Table2], ['Attendance', 'attendance', ClipboardCheck], ['Marks', 'marks', GraduationCap], ['Requests', 'requests', FileText], ['Document Assignments', 'document-review-assignments', UserRoundCheck], ['Portion Progress', 'portion-progress', Activity], ['Department Operations', 'announcements', Bell], ['Audit', 'audit', ShieldCheck], ['Reports', 'reports', ListChecks]]),
  [USER_ROLES.faculty]: items(ROUTE_PATHS.faculty, [['Dashboard', '', LayoutDashboard], ['Timetable', 'timetable', Table2], ['Attendance', 'attendance', ClipboardCheck], ['Marks', 'marks', GraduationCap], ['Requests', 'requests', FileText], ['Document Reviews', 'document-reviews', FileText], ['Jury Reviews', 'jury-reviews', ShieldCheck], ['Portion Completion', 'portion-completion', Activity], ['Announcements', 'announcements', Bell]]),
  [USER_ROLES.labAssistant]: items(ROUTE_PATHS.labAssistant, [['Dashboard', '', LayoutDashboard], ['Lab Timetable', 'lab-timetable', Table2], ['Attendance', 'attendance', ClipboardCheck], ['Leave', 'leave', FileText], ['Announcements', 'announcements', Bell]]),
  [USER_ROLES.student]: items(ROUTE_PATHS.student, [['Dashboard', '', LayoutDashboard], ['Timetable', 'timetable', Table2], ['Attendance', 'attendance', ClipboardCheck], ['Marks', 'marks', GraduationCap], ['Requests', 'requests', FileText], ['Document Status', 'document-status', FileText], ['Announcements', 'announcements', Bell], ['Complaints', 'complaints', MessageSquareWarning]]),
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [USER_ROLES.superAdmin]: 'Super Admin', [USER_ROLES.hod]: 'HOD', [USER_ROLES.faculty]: 'Faculty', [USER_ROLES.labAssistant]: 'Lab Assistant', [USER_ROLES.student]: 'Student',
}

export const APP_NAVIGATION_ICON = BookOpen
