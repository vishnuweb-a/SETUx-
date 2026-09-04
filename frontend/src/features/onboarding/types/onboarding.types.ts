import type { OnboardingStatus, UserRole } from '@/features/auth';

/** Payload of `GET /api/v1/onboarding/status` (onboarding.md §21). */
export interface OnboardingStatusResponse {
  readonly status: OnboardingStatus;
  readonly role: UserRole;
  /** The verified account email, displayed read-only on the form. */
  readonly email: string;
}

/** The citizen half of `GET /api/v1/onboarding/profile` (onboarding.md §23). */
export interface CitizenProfileData {
  readonly fullName: string;
  readonly governmentId: string;
  readonly mobileNumber: string;
  readonly dateOfBirth: string | null;
}

/** The officer half of `GET /api/v1/onboarding/profile`. */
export interface GovernmentProfileData {
  readonly organizationName: string;
  readonly organizationCode: string;
  readonly department: string;
  readonly fullName: string;
  readonly employeeId: string;
  readonly designation: string;
  readonly officialMobileNumber: string;
}

export interface OnboardingProfileResponse {
  readonly status: OnboardingStatus;
  readonly role: UserRole;
  readonly profile: CitizenProfileData | GovernmentProfileData | null;
}

/**
 * Payload returned once onboarding succeeds (onboarding.md §14, §20).
 *
 * `redirect` is the destination the *backend* chose. The UI follows it rather
 * than computing one from a role it holds locally, so there is a single owner
 * of the routing decision.
 */
export interface OnboardingCompletionResponse {
  readonly onboardingStatus: OnboardingStatus;
  readonly role: UserRole;
  readonly redirect: string;
}

/** Departments available under an organization code, for the officer picker. */
export interface OrganizationDepartmentsResponse {
  readonly organizationName: string | null;
  readonly departments: readonly string[];
}

/**
 * Field-level errors as the backend reports them.
 *
 * Keyed by the schema field name, so the form can attach each message to the
 * input that produced it (onboarding.md §9, §38).
 */
export type OnboardingFieldErrors = Readonly<Record<string, string>>;
