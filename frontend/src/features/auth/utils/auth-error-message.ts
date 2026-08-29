import { ApiError } from '@/services/api-client';

const INVALID_CREDENTIALS = 'Invalid email or password.';
const GENERIC_FAILURE = 'Could not sign you in. Please try again.';
const RATE_LIMITED = 'Too many attempts. Please wait a moment and try again.';
const OFFLINE = 'Could not reach SetuX. Check your connection and try again.';

/**
 * Supabase Auth error messages that mean the credentials were wrong.
 *
 * Matched by substring because the wording varies by Auth version; anything
 * unmatched falls through to the generic message rather than being shown raw.
 */
const CREDENTIAL_FAILURES = ['invalid login credentials', 'invalid credentials', 'email not confirmed'];

/**
 * Converts any sign-in failure into a safe, user-facing sentence.
 *
 * Two rules drive this function. Raw Supabase or backend error objects are
 * never surfaced — they carry internal detail that has no place in the UI
 * (Phase 3 §26). And a wrong password and an unknown account produce the *same*
 * message, so the form cannot be used to discover which accounts exist
 * (auth-api.md §26).
 */
export const toAuthErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.code === 'RATE_LIMIT_EXCEEDED') return RATE_LIMITED;
    if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') return OFFLINE;
    if (error.status === 401) return INVALID_CREDENTIALS;
    return GENERIC_FAILURE;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (CREDENTIAL_FAILURES.some((failure) => message.includes(failure))) {
      return INVALID_CREDENTIALS;
    }

    if (message.includes('rate limit') || message.includes('too many')) {
      return RATE_LIMITED;
    }

    if (message.includes('fetch') || message.includes('network')) {
      return OFFLINE;
    }
  }

  return GENERIC_FAILURE;
};
