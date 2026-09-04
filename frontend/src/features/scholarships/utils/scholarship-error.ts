import { ApiError } from '@/services/api-client';

const GENERIC = 'The scholarship catalogue could not be loaded. Please try again.';
const OFFLINE = 'Could not reach SetuX. Check your connection and try again.';
const RATE_LIMITED = 'Too many requests. Please wait a moment and try again.';
const SESSION_ENDED = 'Your session has expired. Please sign in again.';
const FORBIDDEN = 'The scholarship catalogue is not available for your account.';

/**
 * Turns a catalogue failure into a safe sentence.
 *
 * Nothing from the server is passed through here, unlike the onboarding
 * equivalent. Onboarding has codes whose messages are written for the citizen
 * ("that government ID is already registered"); the catalogue has none — every
 * failure it can produce is either a network problem or an internal one, and an
 * internal one must never be quoted (Phase 5 §38).
 */
export const toScholarshipErrorMessage = (error: unknown): string => {
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
      return FORBIDDEN;

    default:
      return GENERIC;
  }
};

/**
 * Whether a failure means "no such scholarship".
 *
 * `RESOURCE_NOT_FOUND` covers an unknown id and an unpublished one alike — the
 * backend answers both the same way on purpose — so the screen shows one
 * not-found state for either (Phase 5 §39).
 */
export const isScholarshipNotFound = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 404 || error.code === 'RESOURCE_NOT_FOUND');

/**
 * A malformed id is rejected as a validation error before it reaches the
 * database. To the citizen following a broken link that is still "no such
 * scholarship", so it is treated as one rather than shown as a form error on a
 * screen with no form.
 */
export const isInvalidScholarshipId = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'VALIDATION_ERROR';
