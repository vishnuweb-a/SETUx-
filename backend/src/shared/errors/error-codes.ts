/**
 * Machine-readable error codes returned to API clients.
 *
 * The set is defined by AGENT.md §16 and
 * `docs/ERROR-HANDLING/exception-handling.md` §8. Codes are declared here in
 * full so the contract is stable; the phases that introduce authentication,
 * connectors and business rules raise the ones they need.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  /**
   * Authentication codes — `docs/API/auth-api.md` §28,
   * `docs/ERROR-HANDLING/exception-handling.md` §8.
   *
   * These stay deliberately coarse. A client is told that authentication
   * failed, never *why* it failed, so that error responses cannot be used to
   * probe which accounts exist or why a token was rejected (auth-api.md §26).
   */
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',

  CONNECTOR_ERROR: 'CONNECTOR_ERROR',
  CONNECTOR_TIMEOUT: 'CONNECTOR_TIMEOUT',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
