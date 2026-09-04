import { ApiError } from '@/services/api-client';
import type { OnboardingFieldErrors } from '../types/onboarding.types';

const GENERIC = 'Could not save your profile. Please try again.';
const OFFLINE = 'Could not reach SetuX. Check your connection and try again.';
const RATE_LIMITED = 'Too many attempts. Please wait a moment and try again.';
const SESSION_ENDED = 'Your session has expired. Please sign in again.';
const FORBIDDEN = 'This onboarding form is not available for your account.';
const ALREADY_DONE = 'Your SetuX profile is already complete.';

/**
 * Turns any submission failure into a safe sentence for the form's alert.
 *
 * Backend messages for onboarding-specific codes are already written for users
 * and are shown as-is; everything else is replaced. A raw Supabase or Postgres
 * message must never reach the screen (Phase 4 §36).
 */
export const toOnboardingErrorMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) {
    return GENERIC;
  }

  switch (error.code) {
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return OFFLINE;

    case 'RATE_LIMIT_EXCEEDED':
      return RATE_LIMITED;

    case 'AUTH_TOKEN_MISSING':
    case 'AUTH_INVALID_TOKEN':
    case 'AUTH_SESSION_EXPIRED':
      return SESSION_ENDED;

    case 'FORBIDDEN':
    case 'ONBOARDING_ROLE_MISMATCH':
      return FORBIDDEN;

    case 'ONBOARDING_ALREADY_COMPLETED':
      return ALREADY_DONE;

    // Written by the onboarding module for exactly this purpose.
    case 'ONBOARDING_VALIDATION_ERROR':
    case 'ONBOARDING_DUPLICATE_IDENTIFIER':
    case 'VALIDATION_ERROR':
      return error.message;

    default:
      return GENERIC;
  }
};

/**
 * Extracts the `{ field: message }` map the backend attaches to a validation
 * failure, so a server-side rejection lands on the input that caused it.
 *
 * Anything that is not a string-to-string map is discarded rather than
 * rendered: `details` is only trusted for its shape, never assumed.
 */
export const toOnboardingFieldErrors = (error: unknown): OnboardingFieldErrors => {
  if (!(error instanceof ApiError) || typeof error.details !== 'object' || !error.details) {
    return {};
  }

  const entries = Object.entries(error.details as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  return Object.fromEntries(entries);
};
