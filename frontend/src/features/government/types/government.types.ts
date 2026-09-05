import type { VerificationStatus } from '@/features/verifications';

/**
 * The decisions an officer may take.
 *
 * `review_decision` also carries REQUESTED_INFO in the schema. It is not
 * offered here because Phase 11 has no channel to carry the request back to the
 * citizen, and a control that records an intention nobody is notified of is a
 * dead end dressed as an action.
 */
export type ReviewDecision = 'APPROVED' | 'REJECTED';

/**
 * The application states the officer portal renders.
 *
 * VERIFICATION is what Phase 10 leaves an application in and is what "awaiting
 * review" means. SUBMITTED appears in the queue only for applications that have
 * not yet been verified — they are visible but not decidable.
 */
export type OfficerApplicationStatus =
  | 'SUBMITTED'
  | 'VERIFICATION'
  | 'APPROVED'
  | 'REJECTED';

/** The queue filter values the backend accepts. */
export type ReviewQueueFilter = 'VERIFICATION' | 'APPROVED' | 'REJECTED';

/**
 * A count of verification outcomes.
 *
 * Deliberately counts rather than a verdict. Verification is ADVISORY: a row
 * showing 4 verified is not "approve this", and one showing a failure is not
 * "reject this". The officer decides (§4).
 */
export interface ReviewVerificationSummary {
  readonly verified: number;
  readonly failed: number;
  readonly requiresAction: number;
  readonly total: number;
}

export interface ReviewQueueItem {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly citizenName: string;
  readonly serviceName: string;
  readonly status: OfficerApplicationStatus;
  readonly submittedAt: string | null;
  readonly updatedAt: string;
  readonly verificationSummary: ReviewVerificationSummary;
  readonly decision: ReviewDecision | null;
}

export interface ReviewQueuePayload {
  readonly items: readonly ReviewQueueItem[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

/** Officer dashboard counts. Every one is computed from persisted rows. */
export interface ReviewDashboardPayload {
  readonly awaitingReview: number;
  readonly approved: number;
  readonly rejected: number;
  readonly totalReviewed: number;
  readonly department: string;
  readonly officerName: string;
}

export interface ReviewVerification {
  readonly requirementCode: string;
  readonly information: string;
  readonly required: boolean;
  readonly status: VerificationStatus | null;
  readonly reasonCode: string | null;
  readonly verifiedAt: string | null;
}

/** One retrieved value, with the system that supplied it. */
export interface ReviewEvidenceItem {
  readonly fieldCode: string;
  readonly label: string;
  readonly value: string;
  readonly sourceName: string | null;
  readonly verificationStatus: string;
  readonly verifiedAt: string | null;
}

export interface ReviewEvidenceGroup {
  readonly sourceName: string;
  readonly items: readonly ReviewEvidenceItem[];
}

/** A decision already recorded on an application. */
export interface ReviewRecord {
  readonly decision: ReviewDecision;
  readonly reviewerName: string | null;
  readonly remarks: string | null;
  readonly reviewedAt: string;
}

export interface ReviewDetailPayload {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly status: OfficerApplicationStatus;
  readonly submittedAt: string | null;
  readonly updatedAt: string;
  readonly service: {
    readonly code: string;
    readonly name: string;
    readonly department: string;
  };
  readonly applicant: {
    readonly fullName: string;
    readonly governmentId: string;
    readonly mobileNumber: string;
    readonly dateOfBirth: string | null;
  };
  readonly declaredFields: Readonly<Record<string, string>>;
  readonly evidence: readonly ReviewEvidenceGroup[];
  readonly verifications: readonly ReviewVerification[];
  readonly verificationSummary: ReviewVerificationSummary;
  readonly review: ReviewRecord | null;
  /**
   * Whether a decision is still open, as the SERVER sees it.
   *
   * Rendered, never computed here. A browser that decided this for itself could
   * only ever be asking the server to accept something it has already refused.
   */
  readonly canDecide: boolean;
}

export interface ReviewDecisionRequest {
  readonly decision: ReviewDecision;
  readonly remarks?: string;
}
