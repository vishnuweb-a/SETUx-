import type { ScholarshipRequirement } from '@/features/scholarships';

/**
 * The lifecycle states a citizen application reaches through Phase 10.
 *
 * VERIFICATION is the value the database `application_status` enum defines and
 * the state an application enters when its evidence has been checked. The phase
 * documents' prose calls it "UNDER_VERIFICATION"; that is the same state under a
 * different name and is deliberately not introduced here as a second value.
 *
 * APPROVED and REJECTED are the Phase 11 final states. They are reached ONLY by
 * an officer recording a decision — never by a verification outcome, however
 * complete. A citizen sees one of them because a person decided, and the two
 * are the end of the lifecycle: nothing transitions out of them.
 */
export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VERIFICATION'
  | 'APPROVED'
  | 'REJECTED';

export interface ApplicationServiceSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly department: string;
}

export interface ApplicationSummary {
  readonly id: string;
  readonly applicationNumber: string;
  readonly service: ApplicationServiceSummary;
  readonly status: ApplicationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
}

export interface ApplicationDetail extends ApplicationSummary {
  readonly applicant: {
    readonly fullName: string;
    readonly governmentId: string;
    readonly mobileNumber: string;
    readonly dateOfBirth: string | null;
  };
  readonly requirements: readonly ScholarshipRequirement[];
  readonly fields: Readonly<Record<string, string>>;
}

export interface ApplicationListPayload {
  readonly items: readonly ApplicationSummary[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}
