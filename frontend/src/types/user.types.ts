import type { FacultyResponsibility, UserRole, UserStatus } from '@/types/auth.types'

/** Extensible user contract for future service and Supabase adapters. */
export interface AppUser {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  avatarUrl?: string
  registerNumber?: string
  sectionId?: string
  facultyResponsibilities?: FacultyResponsibility[]
}
