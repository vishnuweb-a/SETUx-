/**
 * Shared shape of every SetuX API response.
 *
 * Mirrors `backend/src/shared/utils/api-response.ts`. Feature phases define
 * their own `TData` payloads; this envelope never changes.
 */

export interface ApiSuccessBody<TData> {
  readonly success: true;
  readonly data: TData;
  readonly message?: string;
}

export interface ApiErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly requestId: string;
}

export interface ApiErrorBody {
  readonly success: false;
  readonly error: ApiErrorPayload;
}

export type ApiResponseBody<TData> = ApiSuccessBody<TData> | ApiErrorBody;

/** Client-side error codes used when the server never produced an envelope. */
export const CLIENT_ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
} as const;
