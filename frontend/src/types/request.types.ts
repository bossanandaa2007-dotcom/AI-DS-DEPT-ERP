export type RequestStatus = 'draft' | 'submitted' | 'class_teacher_approved' | 'faculty_approved' | 'faculty_rejected' | 'hod_approved' | 'hod_rejected' | 'provisional_approved' | 'certificate_pending' | 'certificate_verified' | 'finalized' | 'rejected' | 'cancelled' | 'expired'
export type RequestKind = 'student_leave' | 'staff_leave' | 'gate_pass' | 'project' | 'competition' | 'od'
export interface RequestHistory { status: RequestStatus; actor: string; timestamp: string; note?: string }
export interface DepartmentRequest { id: string; kind: RequestKind; requesterId: string; title: string; details: Record<string, string>; status: RequestStatus; history: RequestHistory[]; locked: boolean; linkedProjectId?: string; linkedCompetitionId?: string; proof?: string; certificate?: string }
export interface RequestDraft { kind: RequestKind; title: string; details: Record<string, string>; linkedProjectId?: string; linkedCompetitionId?: string; proof?: string }
