import type { Enums } from '../../database/index.js';
import type { ApplicationStatus } from '../applications/application.types.js';
import type { VerificationStatus } from '../verifications/verification.types.js';

/**
 * The decisions an officer may take in Phase 11.
 *
 * `review_decision` also carries REQUESTED_INFO. It stays in the schema and is
 * deliberately not produced here: asking a citizen for more information is a
 * conversation Phase 11 has no channel for — no notification, no reply path,
 * and no status the citizen's tracker could explain. A decision the system
 * cannot follow through on is a promise the API does not keep, so the officer
 * is offered only the two that finish the application.
 *
 * Both are HUMAN decisions. Nothing in this module derives either one from a
 * verification outcome (§4, §13).
 */
export const REVIEW_DECISION = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const satisfies Partial<Record<Enums<'review_decision'>, Enums<'review_decision'>>>;

export type ReviewDecision = (typeof REVIEW_DECISION)[keyof typeof REVIEW_DECISION];

/**
 * The statuses the officer queue can be filtered by.
 *
 * These are the three an officer's work actually divides into: what still needs
 * them, and what they have already decided either way. Every other member of
 * `application_status` describes an application that has not yet reached the
 * officer, and offering it as a filter would imply a queue view that is always
 * empty.
 */
export const REVIEW_QUEUE_FILTER = {
  AWAITING_REVIEW: 'VERIFICATION',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const satisfies Record<string, ApplicationStatus>;

export type ReviewQueueFilter =
  (typeof REVIEW_QUEUE_FILTER)[keyof typeof REVIEW_QUEUE_FILTER];

/** One requirement's verification outcome, as the officer sees it. */
export interface ReviewVerification {
  readonly requirementCode: string;
  /** "Income Certificate" — configured wording, not a database identifier. */
  readonly information: string;
  readonly required: boolean;
  readonly status: VerificationStatus | null;
  /** Structured code. Never prose, never an evidence value. */
  readonly reasonCode: string | null;
  readonly verifiedAt: string | null;
}

/**
 * A count of verification outcomes, for the queue row.
 *
 * The queue shows the shape of the evidence without the officer opening the
 * application, but it deliberately does NOT reduce these to a single
 * pass/fail verdict. A summary that said "ready to approve" would be the
 * automated recommendation Phase 11 exists to avoid (§4).
 */
export interface ReviewVerificationSummary {
  readonly verified: number;
  readonly failed: number;
  readonly requiresAction: number;
  readonly total: number;
}

/** One row of the officer's queue. */
export interface ReviewQueueItem {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly citizenName: string;
  readonly serviceName: string;
  readonly status: ApplicationStatus;
  readonly submittedAt: string | null;
  readonly updatedAt: string;
  readonly verificationSummary: ReviewVerificationSummary;
  /** Present once decided; null while the application is awaiting review. */
  readonly decision: ReviewDecision | null;
}

export interface ReviewQueuePayload {
  readonly items: readonly ReviewQueueItem[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

/**
 * The officer's dashboard counts.
 *
 * Every number is counted from persisted rows within the officer's own
 * department scope. Nothing here is estimated, seeded or hard-coded (§10).
 */
export interface ReviewDashboardPayload {
  readonly awaitingReview: number;
  readonly approved: number;
  readonly rejected: number;
  readonly totalReviewed: number;
  readonly department: string;
  readonly officerName: string;
}

/**
 * One piece of retrieved evidence, as the officer sees it.
 *
 * Carries its provenance — which system supplied it and when SetuX judged it —
 * because an officer deciding on federated data must be able to see where each
 * value came from. That is the interoperability claim the whole prototype
 * makes, and evidence with no attributable source would not support it.
 *
 * The raw provider payload is never included: `application_data` already holds
 * SetuX's normalized representation, and the officer sees that (§12).
 */
export interface ReviewEvidenceItem {
  readonly fieldCode: string;
  /** "Institution" — a human label derived from the field code. */
  readonly label: string;
  readonly value: string;
  /** "Education Department (Mock)", or null for a citizen declaration. */
  readonly sourceName: string | null;
  readonly verificationStatus: string;
  readonly verifiedAt: string | null;
}

/** Evidence grouped by the system that supplied it. */
export interface ReviewEvidenceGroup {
  readonly sourceName: string;
  readonly items: readonly ReviewEvidenceItem[];
}

/** The decision already taken on an application, if any. */
export interface ReviewRecord {
  readonly decision: ReviewDecision;
  readonly reviewerName: string | null;
  readonly remarks: string | null;
  readonly reviewedAt: string;
}

/**
 * Everything the officer needs to decide, and nothing more.
 *
 * `canDecide` is server-derived from the application's status: the browser
 * never computes whether a decision is still open, because a client that could
 * flip it would only be asking the server to accept a decision it has already
 * refused. The RPC guards the same condition a third time.
 */
export interface ReviewDetailPayload {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly status: ApplicationStatus;
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
  /** What the citizen declared on the form. */
  readonly declaredFields: Readonly<Record<string, string>>;
  readonly evidence: readonly ReviewEvidenceGroup[];
  readonly verifications: readonly ReviewVerification[];
  readonly verificationSummary: ReviewVerificationSummary;
  readonly review: ReviewRecord | null;
  readonly canDecide: boolean;
}

/** A row of `application_reviews`, as the repository returns it. */
export interface ReviewRow {
  readonly id: string;
  readonly application_id: string;
  readonly reviewer_id: string;
  readonly department_id: string | null;
  readonly decision: Enums<'review_decision'>;
  readonly remarks: string | null;
  readonly reviewed_at: string;
}
