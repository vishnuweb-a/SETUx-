import { apiRequest } from '@/services/api-client';
import type {
  CitizenOnboardingFormValues,
  GovernmentOnboardingFormValues,
} from '../schemas/onboarding.schemas';
import type {
  OnboardingCompletionResponse,
  OnboardingProfileResponse,
  OnboardingStatusResponse,
  OrganizationDepartmentsResponse,
} from '../types/onboarding.types';

/**
 * Onboarding API calls.
 *
 * Every request goes through `apiRequest`, which attaches the bearer token and
 * normalises errors, so nothing here handles credentials or `fetch` directly
 * (Phase 3 §28).
 *
 * No function takes a user id or a role. The backend derives both from the
 * session, and offering a parameter for either would be the beginning of a
 * client-supplied identity (onboarding.md §39).
 */

/** `GET /onboarding/status` — the trusted onboarding state for the session. */
export const fetchOnboardingStatus = async (): Promise<OnboardingStatusResponse> =>
  apiRequest<OnboardingStatusResponse>('/onboarding/status');

/** `GET /onboarding/profile` — anything already saved, to repopulate the form. */
export const fetchOnboardingProfile = async (): Promise<OnboardingProfileResponse> =>
  apiRequest<OnboardingProfileResponse>('/onboarding/profile');

/** `GET /onboarding/organizations/:code/departments` — officer picker options. */
export const fetchOrganizationDepartments = async (
  organizationCode: string,
  signal?: AbortSignal,
): Promise<OrganizationDepartmentsResponse> =>
  apiRequest<OrganizationDepartmentsResponse>(
    `/onboarding/organizations/${encodeURIComponent(organizationCode)}/departments`,
    { signal },
  );

/** `POST /onboarding/citizen` — completes citizen onboarding. */
export const submitCitizenOnboarding = async (
  values: CitizenOnboardingFormValues,
): Promise<OnboardingCompletionResponse> =>
  apiRequest<OnboardingCompletionResponse>('/onboarding/citizen', {
    method: 'POST',
    body: JSON.stringify(values),
  });

/** `POST /onboarding/government` — completes officer onboarding. */
export const submitGovernmentOnboarding = async (
  values: GovernmentOnboardingFormValues,
): Promise<OnboardingCompletionResponse> =>
  apiRequest<OnboardingCompletionResponse>('/onboarding/government', {
    method: 'POST',
    body: JSON.stringify(values),
  });
