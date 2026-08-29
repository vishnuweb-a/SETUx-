import { env } from '@/lib/env';
import { CLIENT_ERROR_CODES, type ApiErrorBody, type ApiSuccessBody } from '@/types/api';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Supplies the current access token, or `null` when nobody is signed in.
 *
 * Injected by the auth layer at start-up rather than imported here, so this
 * module keeps knowing nothing about Supabase and the two can be tested apart.
 */
type AccessTokenProvider = () => Promise<string | null>;

let getAccessToken: AccessTokenProvider = async () => null;

/**
 * Registers the source of the bearer token for every subsequent request.
 *
 * Called once, from the auth provider. Centralising it here is what keeps
 * `Authorization` headers out of individual components and feature services
 * (Phase 3 §28).
 */
export const setAccessTokenProvider = (provider: AccessTokenProvider): void => {
  getAccessToken = provider;
};

/** Handler invoked when the backend reports the session is no longer valid. */
type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler = () => {};

/**
 * Registers what should happen when a request comes back 401.
 *
 * The auth provider uses this to tear down its state the moment the backend
 * stops accepting the session, so protected data cannot linger on screen after
 * a session expires (Phase 3 §13).
 */
export const setUnauthorizedHandler = (handler: UnauthorizedHandler): void => {
  onUnauthorized = handler;
};

/** 401 codes that mean "this session is finished", as opposed to a bad login. */
const SESSION_INVALID_CODES = new Set([
  'AUTH_TOKEN_MISSING',
  'AUTH_INVALID_TOKEN',
  'AUTH_SESSION_EXPIRED',
]);

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

  // Resolved per request rather than captured once, so a token refreshed in the
  // background is picked up automatically.
  const accessToken = await getAccessToken();

  let response: Response;
  try {
    response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
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
    // A rejected session invalidates the whole authenticated state, not just
    // this request, so the auth layer is told before the error propagates.
    if (response.status === 401 && SESSION_INVALID_CODES.has(body.error.code)) {
      onUnauthorized();
    }

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
