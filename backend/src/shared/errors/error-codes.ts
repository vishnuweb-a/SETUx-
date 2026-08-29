/**
 * Machine-readable error codes returned to API clients.
 *
 * Naming follows the convention in `docs/ERROR-HANDLING/exception-handling.md`:
 * uppercase snake case. Feature-specific codes are added by their own phase —
 * this module holds only the infrastructure-level codes.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
