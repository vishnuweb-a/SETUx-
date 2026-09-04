import type { ScholarshipRequirement } from '@/features/scholarships';

export type ApplicationStatus = 'DRAFT' | 'SUBMITTED';

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
