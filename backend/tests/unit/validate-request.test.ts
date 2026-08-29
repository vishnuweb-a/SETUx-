import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler, requestContext } from '../../src/middleware/index.js';
import { validateRequest } from '../../src/shared/validation/index.js';

/** Minimal app exercising the middleware in the same order as the real one. */
const buildApp = (schemas: Parameters<typeof validateRequest>[0]) => {
  const app = express();
  app.use(requestContext);
  app.use(express.json());
  app.post('/test/:id', validateRequest(schemas), (req, res) => {
    res.status(200).json({ success: true, data: { body: req.body, params: req.params } });
  });
  app.use(errorHandler);
  return app;
};

describe('validateRequest', () => {
  it('passes a valid body through and applies parsed values', async () => {
    const app = buildApp({ body: z.object({ count: z.coerce.number() }) });

    const response = await request(app).post('/test/1').send({ count: '42' }).expect(200);

    expect(response.body.data.body).toEqual({ count: 42 });
  });

  it('rejects an invalid body with a VALIDATION_ERROR and field details', async () => {
    const app = buildApp({ body: z.object({ email: z.email() }) });

    const response = await request(app).post('/test/1').send({ email: 'not-an-email' }).expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toHaveProperty('body.email');
  });

  it('validates route params', async () => {
    const app = buildApp({ params: z.object({ id: z.uuid() }) });

    const response = await request(app).post('/test/not-a-uuid').send({}).expect(400);

    expect(response.body.error.details).toHaveProperty('params.id');
  });

  it('reports issues from every request part at once', async () => {
    const app = buildApp({
      body: z.object({ name: z.string() }),
      params: z.object({ id: z.uuid() }),
    });

    const response = await request(app).post('/test/nope').send({}).expect(400);

    expect(Object.keys(response.body.error.details as object)).toEqual(
      expect.arrayContaining(['body.name', 'params.id']),
    );
  });
});
