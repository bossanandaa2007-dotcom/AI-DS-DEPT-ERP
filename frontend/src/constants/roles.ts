import type { FacultyResponsibility, UserRole, UserStatus } from '@/types/auth.types'

export const USER_ROLES = {
  superAdmin: 'super_admin',
  hod: 'hod',
  faculty: 'faculty',
  labAssistant: 'lab_assistant',
  student: 'student',
} as const satisfies Record<string, UserRole>

export const FACULTY_RESPONSIBILITIES = {
  subjectFaculty: 'subject_faculty',
  classTeacher: 'class_teacher',
  facultyGuide: 'faculty_guide',
  labFaculty: 'lab_faculty',
} as const satisfies Record<string, FacultyResponsibility>

export const USER_STATUSES = {
  active: 'active',
  inactive: 'inactive',
  suspended: 'suspended',
} as const satisfies Record<string, UserStatus>
