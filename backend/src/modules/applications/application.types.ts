import type { Enums } from '../../database/index.js';
import type { CitizenProfileData } from '../onboarding/onboarding.types.js';
import type { ServiceRequirement } from '../services/service.types.js';

export type ApplicationStatus = Enums<'application_status'>;

export const APPLICATION_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
} as const satisfies Partial<Record<ApplicationStatus, ApplicationStatus>>;

export interface ApplicationService {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly department: string;
}

export interface ApplicationSummary {
  readonly id: string;
  readonly applicationNumber: string;
  readonly service: ApplicationService;
  readonly status: ApplicationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
}

export interface ApplicationDetail extends ApplicationSummary {
  readonly applicant: CitizenProfileData;
  readonly requirements: readonly ServiceRequirement[];
  readonly fields: Readonly<Record<string, string>>;
}

export interface ApplicationListPayload {
  readonly items: readonly ApplicationSummary[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface ApplicationRow {
  readonly id: string;
  readonly application_number: string;
  readonly citizen_id: string;
  readonly service_id: string;
  readonly status: ApplicationStatus;
  readonly submitted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}
