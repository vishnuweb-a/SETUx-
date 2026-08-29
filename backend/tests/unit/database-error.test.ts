import type { PostgrestError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { DatabaseError, toAppError } from '../../src/database/database-error.js';
import { ConflictError, NotFoundError } from '../../src/shared/errors/index.js';

/** Builds a PostgrestError shaped like the ones the Supabase client returns. */
const pgError = (code: string, message: string, details = ''): PostgrestError =>
  ({ code, message, details, hint: '', name: 'PostgrestError' }) as PostgrestError;

describe('toAppError', () => {
  it('maps a missing row to 404 NOT FOUND', () => {
    const error = toAppError(pgError('PGRST116', 'no rows'), 'applications.findById', 'Application');

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Application not found.');
  });

  it('maps a unique violation to 409 CONFLICT', () => {
    const error = toAppError(
      pgError('23505', 'duplicate key value violates unique constraint'),
      'citizen_profiles.create',
      'Citizen profile',
    );

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.statusCode).toBe(409);
  });

  it('maps a foreign key violation to 409 CONFLICT', () => {
    const error = toAppError(pgError('23503', 'violates foreign key'), 'applications.create');

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  it.each([
    ['23502', 'not-null violation'],
    ['23514', 'check violation'],
    ['22P02', 'invalid enum value'],
  ])('maps %s to a 400 VALIDATION_ERROR', (code) => {
    const error = toAppError(pgError(code, 'rejected'), 'applications.create');

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('maps an RLS or grant denial to 403 FORBIDDEN', () => {
    const error = toAppError(pgError('42501', 'permission denied'), 'audit_logs.create');

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('falls back to a retryable DatabaseError for an unrecognised code', () => {
    const error = toAppError(pgError('08006', 'connection failure'), 'profiles.findById');

    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.statusCode).toBe(500);
    expect(error.retryable).toBe(true);
  });

  it('never leaks schema, SQL or row detail into the client-facing message', () => {
    const leaky = pgError(
      '23505',
      'duplicate key value violates unique constraint "citizen_profiles_government_id_key"',
      'Key (government_id)=(DEMO-GID-0001) already exists.',
    );

    const error = toAppError(leaky, 'citizen_profiles.create', 'Citizen profile');

    expect(error.message).not.toContain('citizen_profiles');
    expect(error.message).not.toContain('government_id');
    expect(error.message).not.toContain('DEMO-GID-0001');
    expect(error.message).not.toContain('constraint');
    expect(error.message).toBe('Citizen profile already exists.');
  });

  it('does not expose details on a validation mapping either', () => {
    const leaky = pgError(
      '23514',
      'new row violates check constraint "applications_submitted_at_matches_status"',
    );

    const error = toAppError(leaky, 'applications.update');

    expect(error.message).not.toContain('applications_submitted_at');
    expect(error.details).toBeUndefined();
  });
});
