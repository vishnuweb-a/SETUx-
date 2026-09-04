import type { OnboardingStatus, UserRole } from '../auth/auth.types.js';

/**
 * Where a completed onboarding lands the user.
 *
 * The backend returns the path rather than letting the client derive it from
 * the role, so the routing decision has one owner (onboarding.md §14, §20).
 */
export const DASHBOARD_PATHS = {
  CITIZEN: '/citizen',
  GOVERNMENT_OFFICER: '/government',
} as const satisfies Record<UserRole, string>;

/** Payload of `GET /api/v1/onboarding/status` (onboarding.md §21). */
export interface OnboardingStatusPayload {
  readonly status: OnboardingStatus;
  readonly role: UserRole;
  /** The verified account email, shown read-only on the form (onboarding.md §12). */
  readonly email: string;
}

/**
 * The citizen profile as the onboarding form needs it back.
 *
 * `governmentId` is included because the field is editable while onboarding is
 * in progress and the form must be able to repopulate it. It is returned only
 * to the profile's own owner — never in a list, a log, or an officer-facing
 * payload (onboarding.md §23, §39).
 */
export interface CitizenProfileData {
  readonly fullName: string;
  readonly governmentId: string;
  readonly mobileNumber: string;
  /** ISO `YYYY-MM-DD`, or `null` when the column was never populated. */
  readonly dateOfBirth: string | null;
}

/**
 * The officer profile as the onboarding form needs it back.
 *
 * The organization and department are returned by their human-readable name and
 * code, which is what the form displays. Their UUIDs stay server-side: a client
 * that never sees an organization id cannot try to submit one.
 */
export interface GovernmentProfileData {
  readonly organizationName: string;
  readonly organizationCode: string;
  readonly department: string;
  readonly fullName: string;
  readonly employeeId: string;
  readonly designation: string;
  readonly officialMobileNumber: string;
}

/** Payload of `GET /api/v1/onboarding/profile` (onboarding.md §23). */
export interface OnboardingProfilePayload {
  readonly status: OnboardingStatus;
  readonly role: UserRole;
  /** `null` until the user has saved something. */
  readonly profile: CitizenProfileData | GovernmentProfileData | null;
}

/**
 * Payload returned once onboarding succeeds (onboarding.md §14, §20).
 *
 * `redirect` is the trusted destination; the browser follows it rather than
 * computing one from a role it holds locally.
 */
export interface OnboardingCompletionPayload {
  readonly onboardingStatus: OnboardingStatus;
  readonly role: UserRole;
  readonly redirect: string;
}

/**
 * A government organization and one of its departments, both resolved from
 * persisted reference data.
 *
 * Produced only by the service after it has verified that the department
 * belongs to the organization. Holding the two ids together in one value is
 * what makes an unmatched pair unrepresentable downstream.
 */
export interface ResolvedOrganization {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly departmentId: string;
  readonly departmentName: string;
}
