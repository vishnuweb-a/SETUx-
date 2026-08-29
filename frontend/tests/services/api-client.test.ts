import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '@/services/api-client';
import { CLIENT_ERROR_CODES } from '@/types/api';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('unwraps the success envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { status: 'healthy' } })),
    );

    await expect(apiRequest<{ status: string }>('/health')).resolves.toEqual({ status: 'healthy' });
  });

  it('prefixes the configured base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: null }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/health');

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/api\/v1\/health$/);
  });

  it('raises an ApiError carrying the backend code and request id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: { code: 'RESOURCE_NOT_FOUND', message: 'Route not found.', requestId: 'req_1' },
          },
          404,
        ),
      ),
    );

    await expect(apiRequest('/missing')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
      requestId: 'req_1',
    });
  });

  it('reports a network failure without leaking the underlying cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await apiRequest('/health').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(CLIENT_ERROR_CODES.NETWORK_ERROR);
  });

  it('rejects a response that is not a SetuX envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ unexpected: true })));

    await expect(apiRequest('/health')).rejects.toMatchObject({
      code: CLIENT_ERROR_CODES.INVALID_RESPONSE,
    });
  });

  it('times out a request that never settles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      ),
    );

    await expect(apiRequest('/health', { timeoutMs: 10 })).rejects.toMatchObject({
      code: CLIENT_ERROR_CODES.TIMEOUT,
    });
  });
});
