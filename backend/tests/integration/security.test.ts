import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

// These tests assert middleware behaviour, not health semantics. The health
// route is simply the most convenient endpoint to exercise, so its database
// probe is stubbed to keep the suite independent of any live project.
vi.mock('../../src/modules/health/health.repository.js', () => ({
  pingDatabase: vi.fn().mockResolvedValue(undefined),
}));

describe('security middleware', () => {
  const app = createApp();

  it('applies Helmet hardening headers', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('does not advertise the server technology', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows the configured browser origin', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not grant CORS access to an unlisted origin', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://evil.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('exposes draft-7 rate limit headers on the versioned API', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    // draft-7 emits a single combined header rather than the legacy trio.
    expect(response.headers['ratelimit']).toMatch(/limit=\d+/);
    expect(response.headers['ratelimit-policy']).toBeDefined();
    expect(response.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('rejects a body that exceeds the configured size limit', async () => {
    const oversized = { blob: 'x'.repeat(2 * 1024 * 1024) };

    const response = await request(app).post('/api/v1/health').send(oversized);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
