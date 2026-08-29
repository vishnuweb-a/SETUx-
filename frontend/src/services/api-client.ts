import { env } from '@/lib/env';

/** Success envelope returned by the SetuX API. */
interface ApiSuccess<TData> {
  success: true;
  data: TData;
  message?: string;
}

/** Error envelope returned by the SetuX API. */
interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown; requestId: string };
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper that unwraps the SetuX response envelope.
 *
 * Feature services build on this rather than calling `fetch` directly, so error
 * shape and base URL handling stay in one place.
 */
export async function apiRequest<TData>(path: string, init?: RequestInit): Promise<TData> {
  const response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || body === null || (body as ApiFailure).success === false) {
    const failure = body as ApiFailure | null;
    throw new ApiError(
      failure?.error.code ?? 'INTERNAL_ERROR',
      failure?.error.message ?? 'The request failed.',
      response.status,
      failure?.error.requestId,
    );
  }

  return (body as ApiSuccess<TData>).data;
}
