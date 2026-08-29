import { ERROR_CODES, type ErrorCode } from './error-codes.js';

export interface AppErrorOptions {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
  readonly retryable?: boolean;
  readonly cause?: unknown;
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

  constructor({ statusCode, code, message, details, retryable = false, cause }: AppErrorOptions) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** Input failed validation. `details` carries field-level information. */
export class ValidationError extends AppError {
  constructor(message = 'The request payload is invalid.', details?: unknown) {
    super({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message, details });
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
