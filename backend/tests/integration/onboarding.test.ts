import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The Phase 4 onboarding contract, exercised against the real middleware chain
 * and the real service and controller layers.
 *
 * Only the two edges are stubbed: the Supabase Auth server and the onboarding
 * repository. Everything between them — `requireAuth`, `requireRole`,
 * `validateRequest`, the controller, the service, the error handler — is the
 * code under test.
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
const repo = {
  findActiveOrganizationByCode: vi.mocked(onboardingRepository.findActiveOrganizationByCode),
  findDepartmentByName: vi.mocked(onboardingRepository.findDepartmentByName),
  listDepartmentNames: vi.mocked(onboardingRepository.listDepartmentNames),
  findCitizenProfile: vi.mocked(onboardingRepository.findCitizenProfile),
  findGovernmentProfile: vi.mocked(onboardingRepository.findGovernmentProfile),
  completeCitizenOnboarding: vi.mocked(onboardingRepository.completeCitizenOnboarding),
  completeGovernmentOnboarding: vi.mocked(onboardingRepository.completeGovernmentOnboarding),
  markOnboardingInProgress: vi.mocked(onboardingRepository.markOnboardingInProgress),
};

const app = createApp();

/** A citizen who has authenticated but not yet onboarded. */
const NEW_CITIZEN = {
  id: 'citizen-1',
  email: 'citizen@example.com',
  role: 'CITIZEN',
  onboardingStatus: 'NOT_STARTED',
} as const;

const ONBOARDED_CITIZEN = { ...NEW_CITIZEN, onboardingStatus: 'COMPLETED' } as const;

const NEW_OFFICER = {
  id: 'officer-1',
  email: 'officer@example.gov.in',
  role: 'GOVERNMENT_OFFICER',
  onboardingStatus: 'NOT_STARTED',
} as const;

const ONBOARDED_OFFICER = { ...NEW_OFFICER, onboardingStatus: 'COMPLETED' } as const;

/**
 * A SetuX profile as `findProfileById` returns one.
 *
 * Typed against the module's own `Profile` so a test fixture cannot drift from
 * the shape the middleware actually consumes.
 */
type StubbedProfile = Awaited<ReturnType<typeof findProfileById>>;

/** Makes any bearer token resolve to the given SetuX profile. */
const signedInAs = (profile: NonNullable<StubbedProfile>): void => {
  getUser.mockResolvedValue({
    data: { user: { id: profile.id, email: profile.email } },
    error: null,
  });
  findProfileByIdMock.mockResolvedValue(profile);
};

/** The organization and department the Phase 2 seed provides. */
const SEEDED_ORGANIZATION = { id: 'org-edu', name: 'Department of Education' };
const SEEDED_DEPARTMENT = { id: 'dept-higher-ed', name: 'Higher Education' };

const withSeededOrganization = (): void => {
  repo.findActiveOrganizationByCode.mockResolvedValue(SEEDED_ORGANIZATION);
  repo.findDepartmentByName.mockResolvedValue(SEEDED_DEPARTMENT);
};

const VALID_CITIZEN_BODY = {
  fullName: 'Rahul Sharma',
  governmentId: 'GOV123456',
  mobileNumber: '9876543210',
  dateOfBirth: '2002-08-15',
};

const VALID_OFFICER_BODY = {
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
  repo.markOnboardingInProgress.mockResolvedValue('IN_PROGRESS');
  repo.completeCitizenOnboarding.mockResolvedValue(undefined);
  repo.completeGovernmentOnboarding.mockResolvedValue(undefined);
  repo.findCitizenProfile.mockResolvedValue(null);
  repo.findGovernmentProfile.mockResolvedValue(null);
  repo.listDepartmentNames.mockResolvedValue([]);
});

// =============================================================================
// Onboarding status — the route the frontend guard depends on
// =============================================================================
describe('GET /api/v1/onboarding/status', () => {
  it('reports NOT_STARTED and the server-resolved role for a new citizen', async () => {
    signedInAs(NEW_CITIZEN);

    const response = await request(app)
      .get('/api/v1/onboarding/status')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(response.body.data).toEqual({
      status: 'NOT_STARTED',
      role: 'CITIZEN',
      email: NEW_CITIZEN.email,
    });
  });

  it('reports COMPLETED once the profile exists', async () => {
    signedInAs(ONBOARDED_CITIZEN);

    const response = await request(app)
      .get('/api/v1/onboarding/status')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(response.body.data.status).toBe('COMPLETED');
  });

  it('serves an officer as well as a citizen', async () => {
    signedInAs(NEW_OFFICER);

    const response = await request(app)
      .get('/api/v1/onboarding/status')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(response.body.data.role).toBe('GOVERNMENT_OFFICER');
  });
});

describe('GET /api/v1/onboarding/profile', () => {
  it('returns the caller’s own saved citizen data', async () => {
    signedInAs({ ...NEW_CITIZEN, onboardingStatus: 'IN_PROGRESS' });
    repo.findCitizenProfile.mockResolvedValue({
      fullName: 'Rahul Sharma',
      governmentId: 'GOV123456',
      mobileNumber: '9876543210',
      dateOfBirth: '2002-08-15',
    });

    const response = await request(app)
      .get('/api/v1/onboarding/profile')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(response.body.data.profile.fullName).toBe('Rahul Sharma');
    // The lookup is keyed by the authenticated id and nothing else.
    expect(repo.findCitizenProfile).toHaveBeenCalledWith(NEW_CITIZEN.id);
  });

  it('moves a NOT_STARTED profile to IN_PROGRESS when the form is opened', async () => {
    signedInAs(NEW_CITIZEN);

    const response = await request(app)
      .get('/api/v1/onboarding/profile')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(repo.markOnboardingInProgress).toHaveBeenCalledWith(NEW_CITIZEN.id);
    expect(response.body.data.status).toBe('IN_PROGRESS');
  });

  it('never walks a COMPLETED profile back to IN_PROGRESS', async () => {
    signedInAs(ONBOARDED_CITIZEN);

    const response = await request(app)
      .get('/api/v1/onboarding/profile')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(repo.markOnboardingInProgress).not.toHaveBeenCalled();
    expect(response.body.data.status).toBe('COMPLETED');
  });
});

// =============================================================================
// Citizen onboarding
// =============================================================================
describe('POST /api/v1/onboarding/citizen', () => {
  it('creates the profile and returns the trusted dashboard route', async () => {
    signedInAs(NEW_CITIZEN);

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send(VALID_CITIZEN_BODY)
      .expect(201);

    expect(response.body.data).toEqual({
      onboardingStatus: 'COMPLETED',
      role: 'CITIZEN',
      redirect: '/citizen',
    });
  });

  it('writes the profile against the authenticated id, not anything in the body', async () => {
    signedInAs(NEW_CITIZEN);

    await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send(VALID_CITIZEN_BODY)
      .expect(201);

    expect(repo.completeCitizenOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ userId: NEW_CITIZEN.id }),
    );
  });

  it('normalizes the government id and strips mobile-number formatting', async () => {
    signedInAs(NEW_CITIZEN);

    await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_CITIZEN_BODY, governmentId: ' gov123456 ', mobileNumber: '+91 98765-43210' })
      .expect(201);

    expect(repo.completeCitizenOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ governmentId: 'GOV123456', mobileNumber: '9876543210' }),
    );
  });

  it('rejects a missing field with 400 and never reaches the database', async () => {
    signedInAs(NEW_CITIZEN);

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send({ fullName: 'Rahul Sharma' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(repo.completeCitizenOnboarding).not.toHaveBeenCalled();
  });

  it.each([
    ['a malformed mobile number', { mobileNumber: '12345' }],
    ['a future date of birth', { dateOfBirth: '2999-01-01' }],
    ['a malformed date', { dateOfBirth: '15-08-2002' }],
    ['a government id with illegal characters', { governmentId: 'GOV 123/456' }],
    ['a one-character name', { fullName: 'R' }],
  ])('rejects %s', async (_label, override) => {
    signedInAs(NEW_CITIZEN);

    await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_CITIZEN_BODY, ...override })
      .expect(400);

    expect(repo.completeCitizenOnboarding).not.toHaveBeenCalled();
  });

  it('answers a second submission from a completed profile with 409', async () => {
    signedInAs(ONBOARDED_CITIZEN);

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send(VALID_CITIZEN_BODY)
      .expect(409);

    expect(response.body.error.code).toBe('ONBOARDING_ALREADY_COMPLETED');
    expect(repo.completeCitizenOnboarding).not.toHaveBeenCalled();
  });

  it('reports a duplicate government id as a field error without naming its holder', async () => {
    signedInAs(NEW_CITIZEN);
    const { ConflictError } = await import('../../src/shared/errors/index.js');
    repo.completeCitizenOnboarding.mockRejectedValue(
      new ConflictError('Citizen profile already exists.'),
    );

    const response = await request(app)
      .post('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send(VALID_CITIZEN_BODY)
      .expect(409);

    expect(response.body.error.code).toBe('ONBOARDING_DUPLICATE_IDENTIFIER');
    expect(response.body.error.details).toHaveProperty('governmentId');
    expect(response.body.error.message).not.toContain('citizen-');
  });
});

describe('PATCH /api/v1/onboarding/citizen', () => {
  it('merges the patch over the stored profile', async () => {
    signedInAs({ ...NEW_CITIZEN, onboardingStatus: 'IN_PROGRESS' });
    repo.findCitizenProfile.mockResolvedValue({
      fullName: 'Rahul Sharma',
      governmentId: 'GOV123456',
      mobileNumber: '9876543210',
      dateOfBirth: '2002-08-15',
    });

    await request(app)
      .patch('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send({ mobileNumber: '9000000001' })
      .expect(200);

    expect(repo.completeCitizenOnboarding).toHaveBeenCalledWith({
      userId: NEW_CITIZEN.id,
      fullName: 'Rahul Sharma',
      governmentId: 'GOV123456',
      mobileNumber: '9000000001',
      dateOfBirth: '2002-08-15',
    });
  });

  it('rejects an empty patch', async () => {
    signedInAs({ ...NEW_CITIZEN, onboardingStatus: 'IN_PROGRESS' });

    await request(app)
      .patch('/api/v1/onboarding/citizen')
      .set('Authorization', 'Bearer token')
      .send({})
      .expect(400);
  });
});

// =============================================================================
// Government officer onboarding
// =============================================================================
describe('POST /api/v1/onboarding/government', () => {
  it('creates the profile and returns the officer dashboard route', async () => {
    signedInAs(NEW_OFFICER);
    withSeededOrganization();

    const response = await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send(VALID_OFFICER_BODY)
      .expect(201);

    expect(response.body.data).toEqual({
      onboardingStatus: 'COMPLETED',
      role: 'GOVERNMENT_OFFICER',
      redirect: '/government',
    });
  });

  it('persists the organization ids it resolved, keyed to the authenticated user', async () => {
    signedInAs(NEW_OFFICER);
    withSeededOrganization();

    await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send(VALID_OFFICER_BODY)
      .expect(201);

    expect(repo.completeGovernmentOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: NEW_OFFICER.id,
        organizationId: SEEDED_ORGANIZATION.id,
        departmentId: SEEDED_DEPARTMENT.id,
      }),
    );
  });

  it('resolves the department within the submitted organization only', async () => {
    signedInAs(NEW_OFFICER);
    withSeededOrganization();

    await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send(VALID_OFFICER_BODY)
      .expect(201);

    expect(repo.findDepartmentByName).toHaveBeenCalledWith({
      organizationId: SEEDED_ORGANIZATION.id,
      departmentName: 'Higher Education',
    });
  });

  it('rejects an unregistered organization code with a field error', async () => {
    signedInAs(NEW_OFFICER);
    repo.findActiveOrganizationByCode.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_OFFICER_BODY, organizationCode: 'PMO' })
      .expect(422);

    expect(response.body.error.code).toBe('ONBOARDING_VALIDATION_ERROR');
    expect(response.body.error.details).toHaveProperty('organizationCode');
    expect(repo.completeGovernmentOnboarding).not.toHaveBeenCalled();
  });

  it('rejects an organization name that contradicts the registered code', async () => {
    signedInAs(NEW_OFFICER);
    withSeededOrganization();

    const response = await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_OFFICER_BODY, organizationName: 'Prime Minister’s Office' })
      .expect(422);

    expect(response.body.error.details).toHaveProperty('organizationName');
    expect(repo.completeGovernmentOnboarding).not.toHaveBeenCalled();
  });

  it('rejects a department that does not belong to the organization', async () => {
    signedInAs(NEW_OFFICER);
    repo.findActiveOrganizationByCode.mockResolvedValue(SEEDED_ORGANIZATION);
    repo.findDepartmentByName.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_OFFICER_BODY, department: 'Defence Procurement' })
      .expect(422);

    expect(response.body.error.details).toHaveProperty('department');
    expect(repo.completeGovernmentOnboarding).not.toHaveBeenCalled();
  });

  it('rejects an invalid officer payload with 400', async () => {
    signedInAs(NEW_OFFICER);

    await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_OFFICER_BODY, officialMobileNumber: 'not-a-number' })
      .expect(400);

    expect(repo.completeGovernmentOnboarding).not.toHaveBeenCalled();
  });

  it('answers a second submission from a completed profile with 409', async () => {
    signedInAs(ONBOARDED_OFFICER);
    withSeededOrganization();

    const response = await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send(VALID_OFFICER_BODY)
      .expect(409);

    expect(response.body.error.code).toBe('ONBOARDING_ALREADY_COMPLETED');
    expect(repo.completeGovernmentOnboarding).not.toHaveBeenCalled();
  });

  it('reports a duplicate employee id as a field error', async () => {
    signedInAs(NEW_OFFICER);
    withSeededOrganization();
    const { ConflictError } = await import('../../src/shared/errors/index.js');
    repo.completeGovernmentOnboarding.mockRejectedValue(new ConflictError('exists'));

    const response = await request(app)
      .post('/api/v1/onboarding/government')
      .set('Authorization', 'Bearer token')
      .send(VALID_OFFICER_BODY)
      .expect(409);

    expect(response.body.error.code).toBe('ONBOARDING_DUPLICATE_IDENTIFIER');
    expect(response.body.error.details).toHaveProperty('employeeId');
  });
});

describe('GET /api/v1/onboarding/organizations/:code/departments', () => {
  it('lists the departments of a registered organization', async () => {
    signedInAs(NEW_OFFICER);
    repo.findActiveOrganizationByCode.mockResolvedValue(SEEDED_ORGANIZATION);
    repo.listDepartmentNames.mockResolvedValue(['Higher Education']);

    const response = await request(app)
      .get('/api/v1/onboarding/organizations/edu/departments')
      .set('Authorization', 'Bearer token')
      .expect(200);

    // Lower-cased in the URL, upper-cased before the lookup.
    expect(repo.findActiveOrganizationByCode).toHaveBeenCalledWith('EDU');
    expect(response.body.data).toEqual({
      organizationName: 'Department of Education',
      departments: ['Higher Education'],
    });
  });

  it('returns an empty list for an unknown code rather than an error', async () => {
    signedInAs(NEW_OFFICER);
    repo.findActiveOrganizationByCode.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/v1/onboarding/organizations/NOPE/departments')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(response.body.data).toEqual({ organizationName: null, departments: [] });
  });
});
