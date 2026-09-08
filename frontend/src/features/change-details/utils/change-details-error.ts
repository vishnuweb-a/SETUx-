import { ApiError } from '@/services/api-client';

/**
 * A safe, user-facing message for a citizen-record failure.
 *
 * Backend codes are mapped to sentences a citizen can act on; anything
 * unrecognised falls through to the generic message rather than surfacing
 * server internals.
 */
export const changeDetailsErrorMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) {
    return 'The request could not be completed. Please try again.';
  }

  // A record of another citizen's returns this same 404 — same status, same
  // code, same message — as an id that never existed. The wording must
  // therefore not hint that the record exists but is someone else's.
  if (error.status === 404) return 'This record could not be found.';

  if (error.code === 'CITIZEN_RECORD_ONBOARDING_REQUIRED') {
    return 'Complete your profile before viewing your government records.';
  }

  if (error.status === 403) {
    return 'Your account does not have access to citizen records.';
  }

  // Network and timeout failures carry a message written for the citizen.
  return error.status === 0
    ? error.message
    : 'The request could not be completed. Please try again.';
};

/** True when the failure means "no such record of yours", which pages render as a not-found state. */
export const isRecordNotFound = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 404;
