import { env } from '@/lib/env';
import { CLIENT_ERROR_CODES, type ApiErrorBody, type ApiSuccessBody } from '@/types/api';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Normalised failure raised by every request made through this client.
 *
 * `code` is the backend's machine-readable code where one was returned, or a
 * `CLIENT_ERROR_CODES` value when the request never reached a SetuX handler.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
    this.details = params.details;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'signal'> {
  /** Aborts the request after this many milliseconds. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

const isErrorBody = (body: unknown): body is ApiErrorBody =>
  typeof body === 'object' && body !== null && (body as ApiErrorBody).success === false;

const isSuccessBody = <TData>(body: unknown): body is ApiSuccessBody<TData> =>
  typeof body === 'object' && body !== null && (body as ApiSuccessBody<TData>).success === true;

/**
 * Single entry point for backend communication.
 *
 * Owns base URL resolution, JSON handling, timeouts and error normalisation so
 * feature services never call `fetch` directly and never re-implement error
 * shape handling.
 */
export async function apiRequest<TData>(
  path: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, signal, headers, ...init }: ApiRequestOptions = {},
): Promise<TData> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...headers },
      signal: signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal,
    });
  } catch (cause) {
    // A caller-initiated abort is propagated so TanStack Query can ignore it.
    if (signal?.aborted) throw cause;

    throw timeoutController.signal.aborted
      ? new ApiError({
          code: CLIENT_ERROR_CODES.TIMEOUT,
          message: 'The request timed out. Please try again.',
          status: 0,
        })
      : new ApiError({
          code: CLIENT_ERROR_CODES.NETWORK_ERROR,
          message: 'Could not reach the SetuX API. Check your connection and try again.',
          status: 0,
        });
  } finally {
    clearTimeout(timer);
  }

  const body: unknown = await response.json().catch(() => null);

  if (isErrorBody(body)) {
    throw new ApiError({
      code: body.error.code,
      message: body.error.message,
      status: response.status,
      requestId: body.error.requestId,
      details: body.error.details,
    });
  }

  if (!response.ok || !isSuccessBody<TData>(body)) {
    throw new ApiError({
      code: CLIENT_ERROR_CODES.INVALID_RESPONSE,
      message: 'The server returned an unexpected response.',
      status: response.status,
    });
  }

  return body.data;
}
