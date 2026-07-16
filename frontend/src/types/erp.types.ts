import type { FacultyResponsibility, UserRole, UserStatus } from '@/types/auth.types'

export interface AcademicYear { id: string; name: string; isActive: boolean }
export interface Semester { id: string; name: string; academicYearId: string }
export interface ClassSection { id: string; year: string; semesterId: string; section: string; classTeacherId?: string }
export interface Subject { id: string; code: string; name: string; semesterId: string }
export interface SubjectAllocation { id: string; facultyId: string; subjectId: string; year: string; semesterId: string; sectionId: string; responsibility: FacultyResponsibility }
export interface TimetableEntry { id: string; day: string; period: number; time: string; subjectId: string; facultyId: string; sectionId: string; room: string; lab?: string }
export interface UserDraft { name: string; email: string; role: UserRole; status: UserStatus }
export interface AllocationDraft { facultyId: string; subjectId: string; year: string; semesterId: string; sectionId: string; responsibility: FacultyResponsibility }
export interface TimetableDraft { day: string; period: number; time: string; subjectId: string; facultyId: string; sectionId: string; room: string; lab?: string }
