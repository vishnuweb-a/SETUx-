/**
 * Machine-readable error codes returned to API clients.
 *
 * The set is defined by AGENT.md §16 and
 * `docs/ERROR-HANDLING/exception-handling.md`. Codes are declared here in full
 * so the contract is stable; the phases that introduce authentication,
 * connectors and business rules raise the ones they need.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CONNECTOR_ERROR: 'CONNECTOR_ERROR',
  CONNECTOR_TIMEOUT: 'CONNECTOR_TIMEOUT',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
