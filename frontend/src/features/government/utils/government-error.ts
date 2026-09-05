import { ApiError } from '@/services/api-client';

/** The failures an officer can distinguish and act on. */
const OFFICER_FACING_CODES = new Set([
  'REVIEW_NOT_APPLICABLE',
  'REVIEW_ALREADY_DECIDED',
  'REVIEW_ONBOARDING_REQUIRED',
]);

/**
 * A safe message for a failed officer request.
 *
 * Never collapses a system error into a decision outcome. A 5xx means SetuX
 * could not record the decision, which is the opposite of having recorded a
 * rejection, and the officer must be able to tell those apart before they act
 * again.
 */
export const governmentErrorMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) {
    return 'The request could not be completed. Please try again.';
  }
  if (error.code && OFFICER_FACING_CODES.has(error.code)) return error.message;
  // An application outside this officer's department is concealed as absent by
  // the backend, so this covers both missing and out-of-scope.
  if (error.status === 404) return 'This application could not be found.';
  if (error.status === 403) return 'You do not have permission to review this application.';
  return error.status === 0
    ? error.message
    : 'The request could not be completed. Please try again.';
};

/** Whether the decision failed because one was already recorded. */
export const isAlreadyDecided = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.code === 'REVIEW_ALREADY_DECIDED' || error.code === 'REVIEW_NOT_APPLICABLE');
