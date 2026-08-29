import type { PostgrestError } from '@supabase/supabase-js';
import { AppError, ConflictError, ERROR_CODES, NotFoundError } from '../shared/errors/index.js';
import { logger } from '../shared/logger/index.js';

/**
 * PostgreSQL SQLSTATE codes the backend maps onto specific application errors.
 * Anything not listed here becomes a generic INTERNAL_ERROR.
 */
const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
  INSUFFICIENT_PRIVILEGE: '42501',
  /** PostgREST: `.single()` matched no rows. */
  NO_ROWS_RETURNED: 'PGRST116',
} as const;

/** Raised when the database is unreachable or returns an unexpected failure. */
export class DatabaseError extends AppError {
  constructor(message = 'A database error occurred.', cause?: unknown) {
    super({
      statusCode: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message,
      retryable: true,
      cause,
    });
  }
}

/**
 * Translates a Supabase/PostgREST error into a SetuX `AppError`.
 *
 * Raw driver errors carry table names, column names, constraint names and SQL
 * fragments. None of that may reach a client (AGENT.md §16), so the full error
 * is logged server-side and a safe, generic equivalent is returned.
 *
 * @param error     the error reported by the Supabase client
 * @param operation short description used in logs, e.g. `'profiles.findById'`
 * @param resource  human-readable resource name used in 404/409 messages
 */
export const toAppError = (
  error: PostgrestError,
  operation: string,
  resource = 'Record',
): AppError => {
  // `details`/`hint` can echo row values, so only the code and operation are
  // logged at this level; the full error is attached for local debugging only.
  logger.error(
    { operation, pgCode: error.code, err: error },
    'Database operation failed',
  );

  switch (error.code) {
    case PG_ERROR.NO_ROWS_RETURNED:
      return new NotFoundError(resource);

    case PG_ERROR.UNIQUE_VIOLATION:
      return new ConflictError(`${resource} already exists.`);

    case PG_ERROR.FOREIGN_KEY_VIOLATION:
      return new ConflictError('A referenced record does not exist or is still in use.');

    case PG_ERROR.NOT_NULL_VIOLATION:
    case PG_ERROR.CHECK_VIOLATION:
    case PG_ERROR.INVALID_TEXT_REPRESENTATION:
      // The database rejected the payload. Field-level detail is withheld
      // because it would disclose the schema.
      return new AppError({
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'The request payload is invalid.',
        cause: error,
      });

    case PG_ERROR.INSUFFICIENT_PRIVILEGE:
      // An RLS policy or a missing grant denied the operation.
      return new AppError({
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: 'You do not have permission to perform this action.',
        cause: error,
      });

    default:
      return new DatabaseError('A database error occurred.', error);
  }
};
