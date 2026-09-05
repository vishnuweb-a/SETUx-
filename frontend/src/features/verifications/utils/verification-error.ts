import { ApiError } from '@/services/api-client';

/**
 * The failures the citizen can actually distinguish and act on.
 *
 * These carry the server's own wording, which is written for them. Note what is
 * NOT in this set and could never be: there is no error code meaning "you did
 * not qualify". A rule that finds evidence wanting returns 201 with a FAILED
 * item in the payload, because it is a finding to show the officer, not an
 * error to refuse the request with (§29).
 */
const CITIZEN_FACING_CODES = new Set([
  'VERIFICATION_NOT_APPLICABLE',
  'VERIFICATION_EVIDENCE_INCOMPLETE',
  'VERIFICATION_ALREADY_STARTED',
  'VERIFICATION_ONBOARDING_REQUIRED',
]);

/**
 * A safe, actionable message for a failed verification request.
 *
 * A system error must never collapse into "verification failed" (§29): the two
 * mean opposite things to a citizen. A rule failure is a finding about their
 * evidence; a 5xx is SetuX being unable to look at all, and telling them their
 * verification failed would report a database problem as a judgement against
 * them. Hence the deliberately neutral wording below — it says the request
 * could not be completed, never that anything about the citizen was found
 * wanting.
 */
export const verificationErrorMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) {
    return 'The request could not be completed. Please try again.';
  }
  if (error.code && CITIZEN_FACING_CODES.has(error.code)) return error.message;
  // Another citizen's application is concealed as absent by the backend, so
  // this message covers both a missing and a forbidden application.
  if (error.status === 404) return 'This information could not be found.';
  // Transport failures carry their own message; everything else, including any
  // 5xx, collapses to a generic line rather than surfacing server detail.
  return error.status === 0
    ? error.message
    : 'The request could not be completed. Please try again.';
};

/**
 * Whether this failure means the run already happened.
 *
 * Worth distinguishing because it is not really a failure: the citizen's own
 * second click, or a concurrent request, and the right response is to show them
 * the outcome that exists rather than an error.
 */
export const isAlreadyStarted = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'VERIFICATION_ALREADY_STARTED';
