import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The Phase 4 §46 attack scenarios, exercised against the real middleware chain.
 *
 * The premise throughout: the attacker fully controls the request — headers,
 * body, path — and controls the frontend. The only thing they do not control is
 * the `profiles` row their verified token resolves to.
 */

const getUser = vi.fn();

vi.mock('../../src/database/index.js', async () => {
  const actual = await vi.importActual<typeof DatabaseModule>('../../src/database/index.js');
  return {
    ...actual,
    getDatabaseClient: () => ({ auth: { getUser } }),
    createIsolatedAuthClient: () => ({ auth: { getUser } }),
  };
});

vi.mock('../../src/modules/auth/auth.repository.js', () => ({
  findProfileById: vi.fn(),
  insertProfile: vi.fn(),
}));

vi.mock('../../src/modules/onboarding/onboarding.repository.js', () => ({
  findActiveOrganizationByCode: vi.fn(),
  findDepartmentByName: vi.fn(),
  listDepartmentNames: vi.fn(),
  findCitizenProfile: vi.fn(),
  findGovernmentProfile: vi.fn(),
  completeCitizenOnboarding: vi.fn(),
  completeGovernmentOnboarding: vi.fn(),
  markOnboardingInProgress: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const onboardingRepository = await import('../../src/modules/onboarding/onboarding.repository.js');
const { createApp } = await import('../../src/app.js');

const findProfileByIdMock = vi.mocked(findProfileById);
const completeCitizenOnboardingMock = vi.mocked(onboardingRepository.completeCitizenOnboarding);
const completeGovernmentOnboardingMock = vi.mocked(
  onboardingRepository.completeGovernmentOnboarding,
);
const findActiveOrganizationByCodeMock = vi.mocked(
  onboardingRepository.findActiveOrganizationByCode,
);
const findDepartmentByNameMock = vi.mocked(onboardingRepository.findDepartmentByName);
const markOnboardingInProgressMock = vi.mocked(onboardingRepository.markOnboardingInProgress);

const app = createApp();

/** The attacker in most scenarios below: a real, fully authenticated citizen. */
const CITIZEN = {
  id: 'citizen-1',
  email: 'citizen@example.com',
  role: 'CITIZEN',
  onboardingStatus: 'NOT_STARTED',
} as const;

const OFFICER = {
  id: 'officer-1',
  email: 'officer@example.gov.in',
  role: 'GOVERNMENT_OFFICER',
  onboardingStatus: 'NOT_STARTED',
} as const;

const VICTIM_CITIZEN_ID = 'citizen-2';

const signedInAs = (profile: typeof CITIZEN | typeof OFFICER): void => {
  getUser.mockResolvedValue({
    data: { user: { id: profile.id, email: profile.email } },
    error: null,
  });
  findProfileByIdMock.mockResolvedValue(profile);
};

const CITIZEN_BODY = {
  fullName: 'Rahul Sharma',
  governmentId: 'GOV123456',
  mobileNumber: '9876543210',
  dateOfBirth: '2002-08-15',
};

const OFFICER_BODY = {
  organizationName: 'Department of Education',
  organizationCode: 'EDU',
  department: 'Higher Education',
  fullName: 'Amit Kumar',
  employeeId: 'EMP-1024',
  designation: 'Application Officer',
  officialMobileNumber: '9876543210',
};

beforeEach(() => {
  vi.clearAllMocks();
  markOnboardingInProgressMock.mockResolvedValue('IN_PROGRESS');
  completeCitizenOnboardingMock.mockResolvedValue(undefined);
  completeGovernmentOnboardingMock.mockResolvedValue(undefined);
  findActiveOrganizationByCodeMock.mockResolvedValue({
    id: 'org-edu',
    name: 'Department of Education',
  });
  findDepartmentByNameMock.mockResolvedValue({ id: 'dept-higher-ed', name: 'Higher Education' });
});

// =============================================================================
// §46.1 — A citizen claims the officer role in the request body
// =============================================================================
describe('a client that sends its own role', () => {
  it('is rejected: the schema has nowhere to put a role', async () => {
    signedInAs(CITIZEN);

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send({ ...CITIZEN_BODY, role: 'GOVERNMENT_OFFICER' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(completeCitizenOnboardingMock).not.toHaveBeenCalled();
  });

  it('cannot reach the officer flow by claiming the officer role', async () => {
    signedInAs(CITIZEN);

    const response = await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ ...OFFICER_BODY, role: 'GOVERNMENT_OFFICER' })
      .expect(403);

    // Denied by `requireRole` on the resolved role, before the body is even read.
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(completeGovernmentOnboardingMock).not.toHaveBeenCalled();
  });

  it('reports the role the server resolved, not the one claimed', async () => {
    signedInAs(CITIZEN);

    const response = await request(app)
      .get('/api/v1/onboarding/status')
      .set('Authorization', 'Bearer token')
      .query({ role: 'GOVERNMENT_OFFICER' })
      .expect(200);

    expect(response.body.data.role).toBe('CITIZEN');
  });
});

// =============================================================================
// §46.2 / §46.3 — Cross-role onboarding
// =============================================================================
describe('cross-role onboarding', () => {
  it('denies a citizen the government onboarding endpoint', async () => {
    signedInAs(CITIZEN);

    await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send(OFFICER_BODY)
      .expect(403);

    expect(completeGovernmentOnboardingMock).not.toHaveBeenCalled();
  });

  it('denies an officer the citizen onboarding endpoint', async () => {
    signedInAs(OFFICER);

    await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send(CITIZEN_BODY)
      .expect(403);

    expect(completeCitizenOnboardingMock).not.toHaveBeenCalled();
  });

  it('denies a citizen the officer PATCH endpoint', async () => {
    signedInAs(CITIZEN);

    await request(app)
      .patch('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ designation: 'Administrator' })
      .expect(403);
  });

  it('denies a citizen the officer department lookup', async () => {
    signedInAs(CITIZEN);

    await request(app)
      .get('/api/v1/onboarding/organizations/EDU/departments')
      .set('Authorization', 'Bearer token')
      .expect(403);
  });
});

// =============================================================================
// §46.4 / §46.6 — Impersonation and forged onboarding state
// =============================================================================
describe('a client that sends another user’s identity', () => {
  it.each([
    ['userId', { userId: VICTIM_CITIZEN_ID }],
    ['user_id', { user_id: VICTIM_CITIZEN_ID }],
    ['id', { id: VICTIM_CITIZEN_ID }],
    ['email', { email: 'victim@example.com' }],
    ['onboardingStatus', { onboardingStatus: 'COMPLETED' }],
  ])('cannot smuggle %s through the citizen schema', async (_label, override) => {
    signedInAs(CITIZEN);

    await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send({ ...CITIZEN_BODY, ...override })
      .expect(400);

    expect(completeCitizenOnboardingMock).not.toHaveBeenCalled();
  });

  it('writes only against the authenticated id when identity headers are forged', async () => {
    signedInAs(CITIZEN);

    await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .set('X-User-Id', VICTIM_CITIZEN_ID)
      .set('X-Setux-Role', 'GOVERNMENT_OFFICER')
      .send(CITIZEN_BODY)
      .expect(201);

    expect(completeCitizenOnboardingMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: CITIZEN.id }),
    );
  });

  it('reads only the authenticated user’s profile when another id is requested', async () => {
    signedInAs(CITIZEN);

    await request(app)
      .get('/api/v1/onboarding/profile')
      .set('Authorization', 'Bearer token')
      .query({ userId: VICTIM_CITIZEN_ID })
      .expect(200);

    expect(vi.mocked(onboardingRepository.findCitizenProfile)).toHaveBeenCalledWith(CITIZEN.id);
  });
});

// =============================================================================
// §46.8 — Organization escalation
// =============================================================================
describe('organization escalation', () => {
  it('rejects an organization id supplied by the client', async () => {
    signedInAs(OFFICER);

    await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ ...OFFICER_BODY, organizationId: 'org-privileged' })
      .expect(400);

    expect(completeGovernmentOnboardingMock).not.toHaveBeenCalled();
  });

  it('rejects a department id supplied by the client', async () => {
    signedInAs(OFFICER);

    await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ ...OFFICER_BODY, departmentId: 'dept-privileged' })
      .expect(400);

    expect(completeGovernmentOnboardingMock).not.toHaveBeenCalled();
  });

  it('rejects an organization code that is not registered', async () => {
    signedInAs(OFFICER);
    findActiveOrganizationByCodeMock.mockResolvedValue(null);

    await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ ...OFFICER_BODY, organizationCode: 'PMO', organizationName: 'Cabinet Secretariat' })
      .expect(422);

    expect(completeGovernmentOnboardingMock).not.toHaveBeenCalled();
  });

  it('persists only ids resolved from reference data, whatever the body claimed', async () => {
    signedInAs(OFFICER);

    await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send(OFFICER_BODY)
      .expect(201);

    expect(completeGovernmentOnboardingMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-edu', departmentId: 'dept-higher-ed' }),
    );
  });

  it('does not let a self-declared designation change anything but the stored text', async () => {
    signedInAs(OFFICER);

    const response = await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ ...OFFICER_BODY, designation: 'Administrator' })
      .expect(201);

    // The role in the response is still the one `profiles` holds.
    expect(response.body.data.role).toBe('GOVERNMENT_OFFICER');
    expect(response.body.data.redirect).toBe('/government');
  });
});

// =============================================================================
// §46.5 / §43 — Anonymous and invalid credentials
// =============================================================================
describe('requests without a valid session', () => {
  const routes = [
    ['get', '/api/v1/onboarding/status'],
    ['get', '/api/v1/onboarding/profile'],
    ['post', '/api/v1/onboarding/citizen'],
    ['patch', '/api/v1/onboarding/citizen'],
    ['post', '/api/v1/onboarding/government'],
    ['patch', '/api/v1/onboarding/government'],
    ['get', '/api/v1/onboarding/organizations/EDU/departments'],
  ] as const;

  it.each(routes)('rejects an anonymous %s %s with 401', async (method, path) => {
    const response = await request(app)[method](path).send(CITIZEN_BODY).expect(401);

    expect(response.body.error.code).toBe('AUTH_TOKEN_MISSING');
  });

  it('rejects an invalid token with 401 and writes nothing', async () => {
    getUser.mockResolvedValue({ data: {}, error: { message: 'invalid claim' } });

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer forged')
      .send(CITIZEN_BODY)
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_INVALID_TOKEN');
    expect(completeCitizenOnboardingMock).not.toHaveBeenCalled();
  });

  it('rejects an expired token with a distinct code so the client can re-authenticate', async () => {
    getUser.mockResolvedValue({ data: {}, error: { message: 'JWT expired' } });

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer stale')
      .send(CITIZEN_BODY)
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_SESSION_EXPIRED');
    expect(completeCitizenOnboardingMock).not.toHaveBeenCalled();
  });

  it('rejects a verified identity with no SetuX profile', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'ghost', email: 'ghost@example.com' } },
      error: null,
    });
    findProfileByIdMock.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send(CITIZEN_BODY)
      .expect(403);

    expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
  });
});

// =============================================================================
// PII — what must never appear in a response
// =============================================================================
describe('sensitive data handling', () => {
  it('never echoes the submitted government id back to the client', async () => {
    signedInAs(CITIZEN);

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send({ ...CITIZEN_BODY, governmentId: 'GOV999SECRET' })
      .expect(201);

    expect(JSON.stringify(response.body)).not.toContain('GOV999SECRET');
  });

  it('never leaks a database constraint name in a conflict response', async () => {
    signedInAs(CITIZEN);
    const { ConflictError } = await import('../../src/shared/errors/index.js');
    completeCitizenOnboardingMock.mockRejectedValue(
      new ConflictError('Citizen profile already exists.'),
    );

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send(CITIZEN_BODY)
      .expect(409);

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('citizen_profiles');
    expect(body).not.toContain('23505');
  });

  it('reports an unexpected database failure as INTERNAL_ERROR, not as onboarding detail', async () => {
    signedInAs(CITIZEN);
    completeCitizenOnboardingMock.mockRejectedValue(
      new Error('connect ECONNREFUSED db.internal:5432'),
    );

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send(CITIZEN_BODY)
      .expect(500);

    // An unrecognised failure is never dressed up as a client-fixable
    // onboarding error, and never carries a `details` map.
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.details).toBeUndefined();
    // Whether the message itself is generic is decided by `config.isProduction`
    // in the Phase 1 error handler, which these tests run with NODE_ENV=test.
  });
});
