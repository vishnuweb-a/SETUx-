import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

// The health endpoint's job is to report what the probe found, so the probe
// itself is stubbed here; the real Supabase round-trip is covered by
// tests/database/connectivity.test.ts against a live project.
vi.mock('../../src/modules/health/health.repository.js', () => ({
  pingDatabase: vi.fn(),
}));

const { pingDatabase } = await import('../../src/modules/health/health.repository.js');
const pingDatabaseMock = vi.mocked(pingDatabase);

describe('GET /api/v1/health', () => {
  const app = createApp();

  beforeEach(() => {
    pingDatabaseMock.mockReset();
  });

  it('reports the service as healthy when the database responds', async () => {
    pingDatabaseMock.mockResolvedValue(undefined);

    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      service: 'setux-backend',
      status: 'healthy',
      dependencies: { database: { status: 'up' } },
    });
    expect(response.body.data.dependencies.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports 503 and degraded when the database is unreachable', async () => {
    pingDatabaseMock.mockRejectedValue(new Error('connection refused'));

    const response = await request(app).get('/api/v1/health').expect(503);

    expect(response.body.data).toMatchObject({
      status: 'degraded',
      dependencies: { database: { status: 'down' } },
    });
  });

  it('never discloses the underlying database error', async () => {
    pingDatabaseMock.mockRejectedValue(
      new Error('password authentication failed for user "postgres"'),
    );

    const response = await request(app).get('/api/v1/health').expect(503);

    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(JSON.stringify(response.body)).not.toContain('postgres');
  });

  it('returns a correlation id header', async () => {
    pingDatabaseMock.mockResolvedValue(undefined);

    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.headers['x-request-id']).toBeDefined();
  });
});

describe('unmatched routes', () => {
  const app = createApp();

  it('returns a structured 404 error', async () => {
    const response = await request(app).get('/api/v1/does-not-exist').expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(response.body.error.requestId).toBeDefined();
  });
});
