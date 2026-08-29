import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('reports the service as healthy', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      service: 'setux-backend',
      status: 'healthy',
    });
  });

  it('returns a correlation id header', async () => {
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
