export const DOCUMENT_VERIFICATION_STATUSES = [
  'pending_faculty_review',
  'faculty_rejected',
  'pending_jury_review',
  'jury_rejected',
  'verified',
  'replaced',
  'requires_jury_review',
] as const

export type DocumentVerificationStatus = typeof DOCUMENT_VERIFICATION_STATUSES[number]
export type DocumentReviewDecision = 'approved' | 'rejected'

export interface DocumentAttachmentReview {
  id: string
  ownerId: string
  status: DocumentVerificationStatus
  requiresJuryReview: boolean
  facultyReviewerId?: string
  facultyReviewedBy?: string
  facultyReviewedAt?: string
  facultyReviewComment?: string
  juryReviewerId?: string
  juryReviewedBy?: string
  juryReviewedAt?: string
  juryReviewComment?: string
  verifiedAt?: string
  replacementForAttachmentId?: string
  isActive: boolean
}

/** Jury eligibility is an active Faculty-assignment capability, never an application role. */
export interface FacultyJuryEligibility {
  facultyAssignmentId: string
  facultyId: string
  isJuryEligible: boolean
  isActive: boolean
}
