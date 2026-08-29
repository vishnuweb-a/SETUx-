import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requireRole } from '../../src/middleware/authorize.js';
import { ForbiddenError, MissingTokenError } from '../../src/shared/errors/index.js';
import type { AuthContext } from '../../src/modules/auth/auth.types.js';

const CITIZEN: AuthContext = {
  userId: 'user-1',
  email: 'citizen@example.com',
  role: 'CITIZEN',
  onboardingStatus: 'NOT_STARTED',
};

const OFFICER: AuthContext = { ...CITIZEN, userId: 'user-2', role: 'GOVERNMENT_OFFICER' };

const run = (auth: AuthContext | undefined, ...roles: ['CITIZEN' | 'GOVERNMENT_OFFICER', ...('CITIZEN' | 'GOVERNMENT_OFFICER')[]]) => {
  const req = { auth, originalUrl: '/api/v1/government/dashboard' } as Request;
  const next = vi.fn() as unknown as NextFunction;
  requireRole(...roles)(req, {} as Response, next);
  return vi.mocked(next);
};

describe('requireRole', () => {
  it('admits a caller holding the required role', () => {
    const next = run(OFFICER, 'GOVERNMENT_OFFICER');

    expect(next).toHaveBeenCalledWith();
  });

  it('denies a citizen reaching a government route', () => {
    const next = run(CITIZEN, 'GOVERNMENT_OFFICER');

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenError);
  });

  it('denies an officer reaching a citizen route — roles are not hierarchical', () => {
    const next = run(OFFICER, 'CITIZEN');

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenError);
  });

  it('fails closed when no auth context was established', () => {
    const next = run(undefined, 'CITIZEN');

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(MissingTokenError);
  });

  it('does not name the required role in the denial message', () => {
    const next = run(CITIZEN, 'GOVERNMENT_OFFICER');
    const error = next.mock.calls[0]?.[0] as unknown as Error;

    expect(error.message).not.toContain('GOVERNMENT_OFFICER');
  });
});
