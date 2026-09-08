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

/**
 * A safe, user-facing message for a change-draft failure (Phase 4).
 *
 * Separate from `changeDetailsErrorMessage` because the two resources fail for
 * different reasons and a citizen deserves the specific sentence: a draft that
 * cannot be found is not a record that cannot be found, and "this detail can no
 * longer be changed" is a different situation from "your session expired".
 *
 * Every branch returns a message written for a citizen. None of them surfaces a
 * server code, a constraint name or a stack — the backend's own error handler
 * withholds internals, and this is the second place that must not reintroduce
 * them.
 */
export const changeDraftErrorMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) {
    return 'The request could not be completed. Please try again.';
  }

  // A draft belonging to another citizen returns this same 404 — same status,
  // same code, same message — as an id that never existed. The wording must not
  // hint that the draft exists but is someone else's.
  if (error.status === 404) {
    return 'This request could not be found. It may have been removed, or the link may be incorrect.';
  }

  if (error.code === 'CHANGE_REQUEST_VALUE_UNCHANGED') {
    return 'Enter a new value that is different from the current one.';
  }

  // The policy engine's refusals. A field that was correctable when the citizen
  // opened the form can stop being correctable before they save it, and saying
  // so plainly is better than a generic failure they cannot act on.
  if (error.code === 'FIELD_NOT_EDITABLE') {
    return 'One of these details can no longer be changed through SetuX. Go back and choose again.';
  }

  if (error.code === 'FIELD_POLICY_NOT_FOUND') {
    return 'One of these details cannot be changed through SetuX. Go back and choose again.';
  }

  if (error.code === 'CHANGE_REQUEST_ONBOARDING_REQUIRED') {
    return 'Complete your profile before requesting a correction.';
  }

  if (error.status === 403) {
    return 'Your account does not have access to correction requests.';
  }

  if (error.status === 400) {
    return 'Check the values you entered and try again.';
  }

  // Network and timeout failures carry a message already written for the
  // citizen; anything else gets the generic sentence rather than server detail.
  return error.status === 0
    ? error.message
    : 'The request could not be completed. Please try again.';
};

/** True when the failure means "no such draft of yours", which pages render as a not-found state. */
export const isChangeDraftNotFound = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 404;
