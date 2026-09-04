import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler, requestContext } from '../../src/middleware/index.js';
import {
  AppError,
  ERROR_CODES,
  ForbiddenError,
  NotFoundError,
  OnboardingValidationError,
  ValidationError,
} from '../../src/shared/errors/index.js';

const buildApp = (thrown: unknown) => {
  const app = express();
  app.use(requestContext);
  app.get('/boom', () => {
    throw thrown;
  });
  app.use(errorHandler);
  return app;
};

describe('errorHandler', () => {
  it('maps an AppError to its own status and code', async () => {
    const response = await request(buildApp(new ForbiddenError())).get('/boom').expect(403);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('includes field details for a ValidationError', async () => {
    const error = new ValidationError('Invalid.', { 'body.name': 'Required' });

    const response = await request(buildApp(error)).get('/boom').expect(400);

    expect(response.body.error.details).toEqual({ 'body.name': 'Required' });
  });

  it('includes field details for an OnboardingValidationError', async () => {
    const error = new OnboardingValidationError('Please correct the highlighted fields.', {
      organizationCode: 'Not registered.',
    });

    const response = await request(buildApp(error)).get('/boom').expect(422);

    expect(response.body.error.code).toBe('ONBOARDING_VALIDATION_ERROR');
    expect(response.body.error.details).toEqual({ organizationCode: 'Not registered.' });
  });

  it('withholds details from an error that does not declare them client-safe', async () => {
    // Details are opt-in: an error carrying internal diagnostics must not have
    // them serialised into the response just because the field is populated.
    const error = new AppError({
      statusCode: 409,
      code: ERROR_CODES.CONFLICT,
      message: 'The request conflicts with the current state.',
      details: { constraint: 'citizen_profiles_government_id_key', table: 'citizen_profiles' },
    });

    const response = await request(buildApp(error)).get('/boom').expect(409);

    expect(response.body.error.details).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('citizen_profiles');
  });

  it('reports an unexpected error as a generic INTERNAL_ERROR', async () => {
    const response = await request(buildApp(new Error('database password is hunter2')))
      .get('/boom')
      .expect(500);

    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('never returns a stack trace to the client', async () => {
    const response = await request(buildApp(new Error('internal failure'))).get('/boom').expect(500);

    expect(JSON.stringify(response.body)).not.toMatch(/\bat\s+\w+.*:\d+:\d+/);
    expect(response.body.error).not.toHaveProperty('stack');
  });

  it('attaches the correlation id to every error response', async () => {
    const response = await request(buildApp(new NotFoundError('Thing')))
      .get('/boom')
      .set('x-request-id', 'req_fixed')
      .expect(404);

    expect(response.body.error.requestId).toBe('req_fixed');
  });
});
