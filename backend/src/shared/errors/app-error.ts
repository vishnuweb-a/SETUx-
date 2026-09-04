import { ERROR_CODES, type ErrorCode } from './error-codes.js';

export interface AppErrorOptions {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
  readonly retryable?: boolean;
  readonly cause?: unknown;
  /**
   * Marks `details` as safe to return to the client.
   *
   * Opt-in, because `details` on an arbitrary error can carry constraint names,
   * row values or driver output. Only errors whose details are a deliberate,
   * client-facing field map set this — the error handler withholds `details`
   * from everything else.
   */
  readonly exposeDetails?: boolean;
}

/**
 * Base class for every error SetuX raises deliberately.
 *
 * The global error handler relies on these fields to produce a safe,
 * consistent response. Errors that are NOT an `AppError` are treated as
 * unexpected and reported to the client as a generic INTERNAL_ERROR.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: unknown;
  readonly retryable: boolean;
  /** Whether the error handler may include `details` in the response body. */
  readonly exposeDetails: boolean;

  constructor({
    statusCode,
    code,
    message,
    details,
    retryable = false,
    cause,
    exposeDetails = false,
  }: AppErrorOptions) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    this.exposeDetails = exposeDetails;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** Input failed validation. `details` carries field-level information. */
export class ValidationError extends AppError {
  constructor(message = 'The request payload is invalid.', details?: unknown) {
    super({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message,
      details,
      // Field-level errors produced by `validateRequest` from Zod issues — a
      // `{ field: message }` map built for the form to display.
      exposeDetails: true,
    });
  }
}

/** The addressed resource does not exist, or must not be revealed to this caller. */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super({
      statusCode: 404,
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message: `${resource} not found.`,
    });
  }
}

/** The caller is not authenticated, or the credential supplied is not valid. */
export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication is required.') {
    super({ statusCode: 401, code: ERROR_CODES.UNAUTHENTICATED, message });
  }
}

/** The caller is authenticated but not permitted to perform this action. */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message });
  }
}

/** The request conflicts with the current state of the resource. */
export class ConflictError extends AppError {
  constructor(message = 'The request conflicts with the current state.') {
    super({ statusCode: 409, code: ERROR_CODES.CONFLICT, message });
  }
}

/**
 * No credential was presented on a protected route.
 *
 * Distinct from {@link UnauthenticatedError} only by its code, so a client can
 * tell "you never signed in" apart from "your session is no longer valid" and
 * react accordingly. Both are 401.
 */
export class MissingTokenError extends AppError {
  constructor(message = 'Authentication is required.') {
    super({ statusCode: 401, code: ERROR_CODES.AUTH_TOKEN_MISSING, message });
  }
}

/**
 * A credential was presented but the Auth server rejected it.
 *
 * The message is deliberately identical for a malformed, forged, revoked or
 * expired token: `docs/ERROR-HANDLING/exception-handling.md` §16 requires that
 * we not reveal why validation failed.
 */
export class InvalidTokenError extends AppError {
  constructor(message = 'Authentication is required.') {
    super({ statusCode: 401, code: ERROR_CODES.AUTH_INVALID_TOKEN, message });
  }
}

/** The session behind an otherwise well-formed credential has expired. */
export class SessionExpiredError extends AppError {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super({ statusCode: 401, code: ERROR_CODES.AUTH_SESSION_EXPIRED, message });
  }
}

/**
 * Sign-in failed.
 *
 * The message never distinguishes "no such account" from "wrong password"
 * (auth-api.md §26, authentication-and-rbac.md §38): doing so would turn the
 * login form into an account-enumeration oracle.
 */
export class InvalidCredentialsError extends AppError {
  constructor(message = 'Invalid email or password.') {
    super({ statusCode: 401, code: ERROR_CODES.AUTH_INVALID_CREDENTIALS, message });
  }
}

/**
 * The caller authenticated, but no SetuX profile backs their identity.
 *
 * This is a data-consistency failure, not an authorization decision, so it is
 * never resolved by inventing a default role — that would silently create a
 * privileged account (Phase 3 §16, §43).
 */
export class ProfileNotFoundError extends AppError {
  constructor(message = 'No SetuX profile is associated with this account.') {
    super({ statusCode: 403, code: ERROR_CODES.PROFILE_NOT_FOUND, message });
  }
}

/**
 * An onboarding payload was rejected by a business rule that schema validation
 * cannot express — an unknown organization code, a department that does not
 * belong to it, a name that contradicts the registered organization.
 *
 * Separate from {@link ValidationError} only by its code, so the onboarding
 * form can map the failure back to a field (onboarding.md §38).
 */
export class OnboardingValidationError extends AppError {
  constructor(
    message = 'Please correct the highlighted fields.',
    details?: Record<string, string>,
  ) {
    super({
      statusCode: 422,
      code: ERROR_CODES.ONBOARDING_VALIDATION_ERROR,
      message,
      details,
      exposeDetails: true,
    });
  }
}

/**
 * The caller has already completed onboarding and is attempting to create their
 * profile again (onboarding.md §26).
 *
 * A 409 rather than an overwrite: a second POST is either a double submit or an
 * attempt to replace a completed profile, and neither should silently rewrite
 * persisted identity data. Corrections go through PATCH while onboarding is
 * still in progress.
 */
export class OnboardingAlreadyCompletedError extends AppError {
  constructor(message = 'Your SetuX profile is already completed.') {
    super({
      statusCode: 409,
      code: ERROR_CODES.ONBOARDING_ALREADY_COMPLETED,
      message,
    });
  }
}

/**
 * The onboarding flow addressed does not match the role SetuX resolved for the
 * caller — a citizen posting to `/onboarding/government`, or the reverse
 * (onboarding.md §27).
 *
 * Distinct from {@link ForbiddenError} by code alone so the client can tell
 * "wrong flow for your account" from "not permitted at all". The role in the
 * message is the caller's own, which they already know.
 */
export class OnboardingRoleMismatchError extends AppError {
  constructor(message = 'This onboarding flow is not available for your account role.') {
    super({
      statusCode: 403,
      code: ERROR_CODES.ONBOARDING_ROLE_MISMATCH,
      message,
    });
  }
}

/**
 * An identifier that must be unique is already registered to someone else — a
 * government ID, or an employee ID within an organization (onboarding.md §30).
 *
 * The message never says who holds it: that would turn onboarding into a
 * lookup oracle for government IDs.
 */
export class OnboardingDuplicateIdentifierError extends AppError {
  constructor(message: string, details?: Record<string, string>) {
    super({
      statusCode: 409,
      code: ERROR_CODES.ONBOARDING_DUPLICATE_IDENTIFIER,
      message,
      details,
      exposeDetails: true,
    });
  }
}

/** No onboarding profile exists yet for the caller (onboarding.md §38). */
export class OnboardingNotFoundError extends AppError {
  constructor(message = 'No onboarding profile exists for this account yet.') {
    super({
      statusCode: 404,
      code: ERROR_CODES.ONBOARDING_NOT_FOUND,
      message,
    });
  }
}
