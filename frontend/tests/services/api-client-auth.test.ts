import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiRequest,
  setAccessTokenProvider,
  setUnauthorizedHandler,
} from '@/services/api-client';

/**
 * Covers the authentication concerns the shared API client took on: attaching
 * the bearer credential, and reporting a rejected session to the auth layer.
 */

const jsonResponse = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  setAccessTokenProvider(async () => null);
  setUnauthorizedHandler(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The headers the client sent on its most recent request. */
const sentHeaders = (): Record<string, string> =>
  (fetchMock.mock.calls.at(-1)?.[1] as RequestInit).headers as Record<string, string>;

describe('api client authentication', () => {
  it('attaches the bearer credential when a session exists', async () => {
    setAccessTokenProvider(async () => 'access-token');
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { ok: true } }));

    await apiRequest('/auth/me');

    expect(sentHeaders().Authorization).toBe('Bearer access-token');
  });

  it('sends no Authorization header when nobody is signed in', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { ok: true } }));

    await apiRequest('/health');

    expect(sentHeaders().Authorization).toBeUndefined();
  });

  it('reads the token per request, so a refreshed token is picked up', async () => {
    let token = 'first-token';
    setAccessTokenProvider(async () => token);
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));

    await apiRequest('/auth/me');
    expect(sentHeaders().Authorization).toBe('Bearer first-token');

    token = 'refreshed-token';
    await apiRequest('/auth/me');
    expect(sentHeaders().Authorization).toBe('Bearer refreshed-token');
  });

  it('notifies the auth layer when the backend rejects the session', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: { code: 'AUTH_SESSION_EXPIRED', message: 'Expired.', requestId: 'req_1' },
        },
        401,
      ),
    );

    await expect(apiRequest('/auth/me')).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not treat a failed sign-in as an expired session', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
            requestId: 'req_2',
          },
        },
        401,
      ),
    );

    await expect(apiRequest('/auth/login')).rejects.toThrow();
    // Wrong password on the login form must not tear down an unrelated session.
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('leaves a 403 to the caller — the session is valid, the action is not', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: { code: 'FORBIDDEN', message: 'Denied.', requestId: 'req_3' } },
        403,
      ),
    );

    await expect(apiRequest('/government/dashboard')).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
