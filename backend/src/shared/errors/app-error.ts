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
