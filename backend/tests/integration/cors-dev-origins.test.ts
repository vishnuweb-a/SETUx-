import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

// As in security.test.ts: these assert CORS behaviour, not health semantics,
// so the health route's database probe is stubbed out.
vi.mock('../../src/modules/health/health.repository.js', () => ({
  pingDatabase: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Regression cover for the auth outage caused by a Vite port fallback.
 *
 * Vite is pinned to 5173, but when a stale dev server holds that port it used
 * to move silently to 5174/5175. The backend's CORS allowlist named only 5173,
 * so the browser blocked every request from the new origin *before* it reached
 * a SetuX handler — sign-in and registration failed with an opaque network
 * error and no server-side trace.
 *
 * The fix has two halves and both are asserted here:
 *   - development accepts the local Vite ports, so a deliberate port change is
 *     survivable rather than a total outage;
 *   - the allowlist is still an allowlist — an unlisted origin is refused, and
 *     the auth endpoints are covered, not just health.
 */
describe('CORS: local development origins', () => {
  const app = createApp();

  it.each(['http://localhost:5174', 'http://localhost:5175', 'http://127.0.0.1:5173'])(
    'accepts the local Vite origin %s outside production',
    async (origin) => {
      const response = await request(app).get('/api/v1/health').set('Origin', origin).expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(origin);
    },
  );

  it('accepts the pinned origin, which is the normal case', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('lets a browser on a fallback port preflight signup', async () => {
    // The preflight is what actually failed: without an allow-origin header the
    // POST is never sent, so registration dies before reaching the API.
    const response = await request(app)
      .options('/api/v1/auth/signup')
      .set('Origin', 'http://localhost:5174')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBeLessThan(400);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5174');
  });

  it('lets a browser on a fallback port preflight the session lookup', async () => {
    const response = await request(app)
      .options('/api/v1/auth/me')
      .set('Origin', 'http://localhost:5174')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.status).toBeLessThan(400);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5174');
  });

  it('still refuses an origin that is not on the list', async () => {
    // The widening is a fixed set of loopback dev ports, not a wildcard.
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://evil.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses a non-loopback host even on an allowed port', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://attacker.test:5174')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
