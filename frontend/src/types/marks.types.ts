export type AssessmentType = 'internal_test' | 'assignment' | 'quiz' | 'practical' | 'model_exam'
export type AssessmentState = 'draft' | 'completed' | 'finalized'
export interface Assessment { id: string; title: string; type: AssessmentType; subjectId: string; year: string; semesterId: string; sectionId: string; maximumMarks: number; date: string; status: AssessmentState; facultyId: string }
export interface MarkEntry { id: string; assessmentId: string; studentId: string; mark: number | null; absent: boolean; locked: boolean }
export interface MarkCorrection { id: string; markEntryId: string; studentId: string; oldMark: number | null; correctedMark: number | null; reason: string; decision: 'pending' | 'approved' | 'rejected'; reviewer?: string; timestamp?: string; history: string[] }
export interface AssessmentDraft { title: string; type: AssessmentType; subjectId: string; year: string; semesterId: string; sectionId: string; maximumMarks: number; date: string }
