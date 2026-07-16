import type { UserRole } from '@/types/auth.types'
export interface PortionCompletion { id: string; timetableEntryId: string; facultyId: string; subjectId: string; year: string; semesterId: string; sectionId: string; unit: string; plannedTopic: string; completedTopic: string; completionPercentage: number; nextTopic: string; updatedAt: string }
export interface AuditRecord { id: string; actor: string; role: UserRole; action: 'create' | 'update' | 'approve' | 'reject' | 'finalize' | 'lock' | 'correction'; module: string; recordReference: string; timestamp: string; summary: string }
