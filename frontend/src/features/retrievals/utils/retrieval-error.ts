import { ApiError } from '@/services/api-client';

/**
 * A safe, actionable message for a failed retrieval.
 *
 * The four cases the citizen can actually distinguish and act on — consent not
 * yet given, consent refused, already done, provider down — carry the server's
 * own wording, which is written for them. Everything else collapses to a
 * generic message rather than surfacing transport detail (Phase 8 §33).
 */
const CITIZEN_FACING_CODES = new Set([
  'RETRIEVAL_CONSENT_REQUIRED',
  'RETRIEVAL_CONSENT_DENIED',
  'RETRIEVAL_ALREADY_COMPLETED',
  'RETRIEVAL_NOT_APPLICABLE',
  'RETRIEVAL_PROVIDER_FAILED',
]);

export const retrievalErrorMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) return 'The request could not be completed. Please try again.';
  if (error.code && CITIZEN_FACING_CODES.has(error.code)) return error.message;
  // An application or requirement belonging to someone else is concealed as
  // absent by the backend, so this message covers both.
  if (error.status === 404) return 'This information could not be found.';
  return error.status === 0
    ? error.message
    : 'The request could not be completed. Please try again.';
};

/** Whether the citizen should be offered a retry for this failure. */
export const isRetryable = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'RETRIEVAL_PROVIDER_FAILED';
